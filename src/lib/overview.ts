// Import solo de tipos: `data.ts` instancia el cliente de Supabase al cargarse
// y este modulo debe seguir siendo puro.
import type { Payment, Ticket } from './data'
import { computeAging, daysBetweenInStoreZone, OVERDUE_THRESHOLD_DAYS, STORE_TIME_ZONE } from './aging'

export type OverdueAccount = {
  clientId: string
  name: string
  balanceCents: number
  ageInDays: number
  /** true si el tramo mas antiguo es un saldo anterior: la fecha es una cota, no un dato exacto. */
  approximate: boolean
}

export type StoreOverview = {
  totalPendingCents: number
  clientsWithDebt: number
  overdueCount: number
  /** Solo los tramos que llevan mas dias que el umbral, no el saldo entero de esas cuentas. */
  overdueCents: number
  monthPurchaseCount: number
  monthPurchaseCents: number
  monthPaymentCount: number
  monthPaymentCents: number
  /** Cuentas por encima del umbral, de mas antigua a mas reciente. */
  overdueAccounts: OverdueAccount[]
}

type OverviewClient = { id: string; name: string }

// Se crea una sola vez: instanciarlo por movimiento dominaba el coste de Inicio.
const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit' })

/** Mes civil (`AAAA-MM`) en la zona de la tienda, para que el corte de mes no dependa de UTC. */
function storeMonth(iso: string): string {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return ''
  return MONTH_FORMAT.format(value)
}

export function buildStoreOverview(
  clients: OverviewClient[],
  tickets: Ticket[],
  payments: Payment[],
  now: Date,
  thresholdDays = OVERDUE_THRESHOLD_DAYS,
): StoreOverview {
  const month = storeMonth(now.toISOString())
  let totalPendingCents = 0
  let clientsWithDebt = 0
  let overdueCents = 0
  const overdueAccounts: OverdueAccount[] = []

  // Se agrupa una sola vez. Filtrar los dos arrays completos dentro del bucle
  // recorria clientes x movimientos, y con 500 clientes eso son millones de
  // comparaciones inutiles.
  const ticketsByClient = new Map<string, Ticket[]>()
  for (const ticket of tickets) {
    const lista = ticketsByClient.get(ticket.client_id)
    if (lista) lista.push(ticket)
    else ticketsByClient.set(ticket.client_id, [ticket])
  }
  const paymentsByClient = new Map<string, Payment[]>()
  for (const payment of payments) {
    const lista = paymentsByClient.get(payment.client_id)
    if (lista) lista.push(payment)
    else paymentsByClient.set(payment.client_id, [payment])
  }

  for (const client of clients) {
    const aging = computeAging(ticketsByClient.get(client.id) ?? [], paymentsByClient.get(client.id) ?? [], now)
    if (aging.balance <= 0) continue
    totalPendingCents += aging.balance
    clientsWithDebt += 1
    // La deuda "vieja" son los tramos que pasan del umbral, no el saldo completo
    // de la cuenta: parte de ese saldo puede ser de ayer.
    const oldCents = aging.slices
      .filter((slice) => daysBetweenInStoreZone(slice.at, now) > thresholdDays)
      .reduce((total, slice) => total + slice.remainingCents, 0)
    if (oldCents > 0 && aging.ageInDays !== null) {
      overdueCents += oldCents
      overdueAccounts.push({ clientId: client.id, name: client.name, balanceCents: aging.balance, ageInDays: aging.ageInDays, approximate: aging.approximate })
    }
  }

  overdueAccounts.sort((a, b) => b.ageInDays - a.ageInDays || a.name.localeCompare(b.name, 'es-ES'))

  // Compras del mes: solo compras reales activas. Un saldo anterior no es una
  // compra de este mes aunque se registrase este mes.
  const monthPurchases = tickets.filter((ticket) => ticket.status === 'active' && ticket.origin !== 'opening_balance' && storeMonth(ticket.created_at) === month)
  const monthPayments = payments.filter((payment) => payment.voided_at === null && storeMonth(payment.created_at) === month)

  return {
    totalPendingCents,
    clientsWithDebt,
    overdueCount: overdueAccounts.length,
    overdueCents,
    monthPurchaseCount: monthPurchases.length,
    monthPurchaseCents: monthPurchases.reduce((total, ticket) => total + ticket.amount_cents, 0),
    monthPaymentCount: monthPayments.length,
    monthPaymentCents: monthPayments.reduce((total, payment) => total + payment.amount_cents, 0),
    overdueAccounts,
  }
}
