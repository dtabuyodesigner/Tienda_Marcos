// Prueba de escala: >que pasa cuando la tienda tiene cientos de clientes?
//
// No es un benchmark de laboratorio. La pregunta es practica: si Marcos abre
// Inicio con 500 clientes y anos de historico, >lo nota la persona que espera
// delante del movil? Y ademas, >siguen saliendo bien las cuentas a esa escala?
//
// Los datos son sinteticos pero DETERMINISTAS (PRNG con semilla fija), asi que
// dos ejecuciones miden lo mismo y una regresion se ve de verdad, no es ruido.
//
// Importante sobre los umbrales: son GENEROSOS a proposito. Aqui solo se quiere
// cazar una regresion de orden de magnitud (algo que pasa de 40 ms a 4000 ms),
// no fallar porque el portatil de turno estaba compilando otra cosa. Un test de
// tiempo ajustado se vuelve un test que falla solo y acaba desactivado.
//
// LO QUE SE MIDIO (portatil de desarrollo, agosto 2026, 4 ejecuciones):
//   clientes  movimientos  buildStoreOverview  computeAging  filtrado NxM
//        100         1077        341 - 542 ms   26 -  53 ms    2 -  4 ms
//        300         3825       1455 - 2766 ms   58 - 130 ms   23 - 62 ms
//        500         5511       1477 - 5680 ms  104 - 239 ms   41 - 91 ms
// La horquilla es ancha porque la maquina estaba cargada. Por eso los umbrales
// de abajo son tan holgados: con esta varianza, un limite fino seria flaky.
//
// Conclusion, que no es la esperada: si, `buildStoreOverview` filtra los arrays
// completos de tickets y pagos por cada cliente, y ese filtrado ES cuadratico
// (x18 de tiempo al pasar de 100 a 500 clientes). Pero en absoluto es pequeno:
// 41 ms de 1477 ms, un 3% de la factura. Lo caro es OTRA cosa: el formateo de
// fechas. `storeMonth` y `daysBetweenInStoreZone` construyen un
// `Intl.DateTimeFormat` NUEVO en cada llamada, y se llaman una vez por
// movimiento. Eso son ~300 us por movimiento y ~1,3 s de los 1,5 s totales.
// Es lineal en movimientos, no cuadratico, pero es lo que hace que abrir Inicio
// con 500 clientes tarde un segundo y medio, que si se nota.
// Este test solo mide y deja constancia; arreglarlo es otra tarea.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Tipos importados con `import type`: `data.ts` instancia el cliente de Supabase
// al cargarse y el test debe seguir siendo puro.
import type { Payment, Ticket } from './data'
import { computeAging } from '../../supabase/functions/_shared/account-summary'
import { buildStoreOverview } from './overview'
import { summarizeClientMovements } from './summary'
import { calculateActiveBalance, searchClients, sortClientsForHome } from './money'

const AHORA = new Date('2026-08-28T10:00:00Z')
const DIA_MS = 86_400_000
const VENTANA_DIAS = 548 // ~18 meses de historico

/** PRNG mulberry32: barato, decente y sobre todo reproducible con semilla fija. */
function crearRng(semilla: number): () => number {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type ClienteSintetico = { id: string; name: string; nickname: string | null }
type Tienda = { clients: ClienteSintetico[]; tickets: Ticket[]; payments: Payment[] }

/**
 * Reparte movimientos con una forma parecida a la real:
 * - una minoria de clientes no tiene nada (alta reciente, o siempre paga al contado)
 * - la mayoria tiene 2-10 compras y 0-5 pagos
 * - unos pocos son clientes intensivos con decenas de movimientos
 * - un ~15% arrastra un `opening_balance` de la libreta de papel
 * - un ~4% de movimientos esta anulado
 */
function generarTienda(numClientes: number, semilla = 20260828): Tienda {
  const rng = crearRng(semilla + numClientes)
  const clients: ClienteSintetico[] = []
  const tickets: Ticket[] = []
  const payments: Payment[] = []

  const fecha = (diasAtras: number) => new Date(AHORA.getTime() - diasAtras * DIA_MS).toISOString()

  for (let i = 0; i < numClientes; i += 1) {
    const id = `c${i}`
    clients.push({ id, name: `Cliente ${String(i).padStart(4, '0')}`, nickname: i % 7 === 0 ? `Apodo${i}` : null })

    const perfil = rng()
    let numTickets: number
    let numPagos: number
    if (perfil < 0.1) {
      numTickets = 0
      numPagos = 0
    } else if (perfil > 0.94) {
      // Cliente intensivo: el que de verdad estresa la ficha individual.
      numTickets = 30 + Math.floor(rng() * 50)
      numPagos = 10 + Math.floor(rng() * 20)
    } else {
      numTickets = 2 + Math.floor(rng() * 9)
      numPagos = Math.floor(rng() * 6)
    }

    if (numTickets > 0 && rng() < 0.15) {
      // Saldo anterior: siempre el movimiento mas viejo de la cuenta.
      tickets.push(crearTicket(`t-${id}-ob`, id, 1000 + Math.floor(rng() * 30000), fecha(VENTANA_DIAS - Math.floor(rng() * 20)), 'opening_balance', 'active'))
    }

    for (let t = 0; t < numTickets; t += 1) {
      const anulado = rng() < 0.04
      tickets.push(
        crearTicket(
          `t-${id}-${t}`,
          id,
          200 + Math.floor(rng() * 12000),
          fecha(Math.floor(rng() * VENTANA_DIAS)),
          'purchase',
          anulado ? 'voided' : 'active',
        ),
      )
    }

    for (let p = 0; p < numPagos; p += 1) {
      const anulado = rng() < 0.04
      payments.push({
        id: `p-${id}-${p}`,
        store_id: 's',
        client_id: id,
        amount_cents: 200 + Math.floor(rng() * 9000),
        created_by: 'u',
        created_at: fecha(Math.floor(rng() * VENTANA_DIAS)),
        voided_at: anulado ? fecha(0) : null,
        voided_by: null,
        void_reason: null,
      })
    }
  }

  return { clients, tickets, payments }
}

function crearTicket(id: string, clientId: string, cents: number, createdAt: string, origin: 'purchase' | 'opening_balance', status: 'active' | 'voided'): Ticket {
  return {
    id,
    store_id: 's',
    client_id: clientId,
    amount_cents: cents,
    concept: origin === 'opening_balance' ? 'Saldo anterior' : 'Compra',
    photo_path: null,
    status,
    origin,
    created_by: 'u',
    created_at: createdAt,
    voided_at: status === 'voided' ? createdAt : null,
    voided_by: null,
    void_reason: null,
  }
}

/** Agrupa una vez por cliente, para poder medir el coste puro de los calculos. */
function agrupar<T extends { client_id: string }>(items: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of items) {
    const lista = mapa.get(item.client_id)
    if (lista) lista.push(item)
    else mapa.set(item.client_id, [item])
  }
  return mapa
}

/**
 * Mide el mejor de varios intentos, con una pasada previa de calentamiento.
 * El minimo es la medida menos contaminada: la maquina puede robar tiempo, pero
 * no puede devolverlo. Asi el numero no depende de si el portatil estaba ocupado.
 */
function medir(fn: () => void, intentos = 3): number {
  fn()
  let mejor = Infinity
  for (let i = 0; i < intentos; i += 1) {
    const inicio = performance.now()
    fn()
    mejor = Math.min(mejor, performance.now() - inicio)
  }
  return mejor
}

type Fila = {
  clientes: number
  movimientos: number
  overviewMs: number
  agingMs: number
  filtradoMs: number
  listaMs: number
  fichaMs: number
}

const filas: Fila[] = []
const ms = (valor: number) => valor.toFixed(1).padStart(9)

afterAll(() => {
  console.log('\n=== Escala: tiempos observados (ms) ===')
  console.log('clientes  movimientos  buildStoreOverview  computeAging(todos)  filtrado NxM  ordenar+buscar  ficha cliente')
  for (const f of filas) {
    console.log(
      `${String(f.clientes).padStart(8)}  ${String(f.movimientos).padStart(11)}  ${ms(f.overviewMs)}         ${ms(f.agingMs)}     ${ms(f.filtradoMs)}       ${ms(f.listaMs)}       ${ms(f.fichaMs)}`,
    )
  }
  // Coste normalizado: si `buildStoreOverview` fuese lineal, el coste POR CLIENTE
  // seria constante. Si crece con el tamano de la tienda, el algoritmo es cuadratico.
  console.log('\nbuildStoreOverview, coste por cliente (us):')
  for (const f of filas) console.log(`  ${String(f.clientes).padStart(4)} clientes -> ${((f.overviewMs * 1000) / f.clientes).toFixed(0)} us/cliente`)

  const primera = filas[0]
  const ultima = filas[filas.length - 1]
  if (primera && ultima && primera.overviewMs > 0) {
    const factorClientes = ultima.clientes / primera.clientes
    const factorTiempo = ultima.overviewMs / primera.overviewMs
    console.log(
      `\nbuildStoreOverview: x${factorClientes} clientes -> x${factorTiempo.toFixed(1)} tiempo ` +
        `(lineal seria ~x${factorClientes}, cuadratico ~x${factorClientes * factorClientes})`,
    )
    console.log(`Reparto a ${ultima.clientes} clientes: filtrado NxM ${ultima.filtradoMs.toFixed(1)} ms + computeAging ${ultima.agingMs.toFixed(1)} ms de ${ultima.overviewMs.toFixed(1)} ms totales`)
    console.log(`Resto (formateo de fechas con Intl dentro del bucle): ~${(ultima.overviewMs - ultima.agingMs - ultima.filtradoMs).toFixed(1)} ms`)
    console.log(`Coste por movimiento: ${filas.map((f) => `${f.clientes}=>${((f.overviewMs * 1000) / f.movimientos).toFixed(0)}us`).join('  ')}`)
  }
})

describe('escala de la tienda', () => {
  // Calentamiento global ANTES de medir nada. Sin esto la primera medida paga
  // la compilacion de V8 y sale inflada, lo que disimula el crecimiento real
  // (parecia lineal cuando no lo es).
  beforeAll(() => {
    const previa = generarTienda(120, 99)
    const porCliente = agrupar(previa.tickets)
    const pagosPorCliente = agrupar(previa.payments)
    for (let i = 0; i < 5; i += 1) {
      buildStoreOverview(previa.clients, previa.tickets, previa.payments, AHORA)
      for (const cliente of previa.clients) computeAging(porCliente.get(cliente.id) ?? [], pagosPorCliente.get(cliente.id) ?? [], AHORA)
      summarizeClientMovements(previa.tickets, previa.payments)
      sortClientsForHome(previa.clients.map((cliente) => ({ ...cliente, balance: 0, lastActivityAt: null })))
      searchClients(previa.clients, 'cli')
    }
  }, 60_000)

  for (const numClientes of [100, 300, 500]) {
    it(
      `aguanta ${numClientes} clientes sin degradarse ni descuadrar`,
      () => {
        const { clients, tickets, payments } = generarTienda(numClientes)
        const movimientos = tickets.length + payments.length
        const ticketsPorCliente = agrupar(tickets)
        const paymentsPorCliente = agrupar(payments)

        // --- Inicio: el resumen global que se calcula al abrir la aplicacion ---
        let overview = buildStoreOverview(clients, tickets, payments, AHORA)
        const overviewMs = medir(() => {
          overview = buildStoreOverview(clients, tickets, payments, AHORA)
        }, 2)

        // --- computeAging para TODOS los clientes, ya agrupados ---
        // Se mide aparte a proposito: es el coste real del calculo, sin el filtrado.
        // La diferencia con `buildStoreOverview` es justo lo que cuesta filtrar.
        const saldos = new Map<string, number>()
        const agingMs = medir(() => {
          for (const cliente of clients) {
            const aging = computeAging(ticketsPorCliente.get(cliente.id) ?? [], paymentsPorCliente.get(cliente.id) ?? [], AHORA)
            saldos.set(cliente.id, aging.balance)
          }
        })

        // --- Coste puro del filtrado NxM que hace `buildStoreOverview` ---
        // `buildStoreOverview` recorre TODO el array de tickets y TODO el de pagos
        // por cada cliente. Eso es cuadratico (clientes x movimientos). Aqui se
        // aisla para saber cuanto de la factura es realmente ese patron y cuanto
        // es otra cosa, en vez de suponerlo.
        let visitados = 0
        const filtradoMs = medir(() => {
          visitados = 0
          for (const cliente of clients) {
            visitados += tickets.filter((ticket) => ticket.client_id === cliente.id).length
            visitados += payments.filter((payment) => payment.client_id === cliente.id).length
          }
        })
        expect(visitados).toBe(movimientos)

        // --- Lista de clientes: ordenar para Inicio + buscar mientras se teclea ---
        const listaOrdenable = clients.map((cliente) => {
          const t = ticketsPorCliente.get(cliente.id) ?? []
          const p = paymentsPorCliente.get(cliente.id) ?? []
          return {
            ...cliente,
            balance: calculateActiveBalance(t, p),
            lastActivityAt: [...t, ...p].map((m) => m.created_at).sort((a, b) => b.localeCompare(a))[0] ?? null,
          }
        })
        let ordenados = listaOrdenable
        let encontrados: typeof listaOrdenable = []
        const listaMs = medir(() => {
          ordenados = sortClientsForHome(listaOrdenable)
          // Busqueda tal como la hace la pantalla: una pasada por cada tecla.
          for (const consulta of ['cli', 'clien', 'cliente 01', 'apodo']) {
            encontrados = searchClients(ordenados, consulta)
          }
        })

        // --- Ficha de un cliente cargado de movimientos ---
        const masMovido = clients.reduce((mejor, cliente) => {
          const total = (ticketsPorCliente.get(cliente.id)?.length ?? 0) + (paymentsPorCliente.get(cliente.id)?.length ?? 0)
          return total > mejor.total ? { id: cliente.id, total } : mejor
        }, { id: clients[0].id, total: -1 })
        const ticketsFicha = ticketsPorCliente.get(masMovido.id) ?? []
        const paymentsFicha = paymentsPorCliente.get(masMovido.id) ?? []
        let ficha = summarizeClientMovements(ticketsFicha, paymentsFicha)
        const fichaMs = medir(() => {
          ficha = summarizeClientMovements(ticketsFicha, paymentsFicha)
        })

        filas.push({ clientes: numClientes, movimientos, overviewMs, agingMs, filtradoMs, listaMs, fichaMs })

        // --- CORRECCION a escala: importa mas que los milisegundos ---
        // El total pendiente de Inicio tiene que ser exactamente la suma de los
        // saldos calculados cliente a cliente. Un descuadre aqui es dinero mal
        // contado, y a 500 clientes nadie lo detectaria a mano.
        const sumaSaldos = [...saldos.values()].filter((saldo) => saldo > 0).reduce((total, saldo) => total + saldo, 0)
        expect(overview.totalPendingCents).toBe(sumaSaldos)
        expect(overview.clientsWithDebt).toBe([...saldos.values()].filter((saldo) => saldo > 0).length)
        expect(overview.overdueCents).toBeLessThanOrEqual(overview.totalPendingCents)
        expect(overview.overdueCount).toBe(overview.overdueAccounts.length)
        expect(overview.overdueCount).toBeLessThanOrEqual(overview.clientsWithDebt)

        // Los datos generados tienen que ser representativos: si algun dia el
        // generador deja de producir deuda, el test pasaria sin medir nada.
        expect(movimientos).toBeGreaterThan(numClientes * 3)
        expect(overview.clientsWithDebt).toBeGreaterThan(numClientes / 4)
        expect(ficha.movementCount).toBeGreaterThan(30)
        expect(ordenados).toHaveLength(numClientes)
        expect(encontrados.length).toBeGreaterThan(0)

        // --- REGRESION: umbrales holgados, para detectar ordenes de magnitud ---
        // Bajados tras cachear los Intl.DateTimeFormat y agrupar los movimientos
        // por cliente: el conjunto paso de ~30 s a ~2 s. Siguen siendo holgados
        // frente a lo observado para no parpadear en una maquina cargada, pero
        // ya lo bastante ajustados para que volver al codigo lento los rompa.
        const limiteOverview = numClientes >= 500 ? 1500 : numClientes >= 300 ? 1000 : 500
        expect(overviewMs).toBeLessThan(limiteOverview)
        expect(agingMs).toBeLessThan(600)
        expect(listaMs).toBeLessThan(300)
        // El filtrado NxM hoy es cuadratico pero pequeno (~41 ms a 500 clientes).
        // Este limite salta si alguna vez pasa a ser el cuello de botella.
        expect(filtradoMs).toBeLessThan(500)
        // La ficha de un solo cliente no depende del tamano de la tienda: si esto
        // se dispara, es que algo empezo a mirar datos que no son suyos.
        expect(fichaMs).toBeLessThan(100)
      },
      60_000,
    )
  }
})
