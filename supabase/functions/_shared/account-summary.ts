// Modelo canonico de la cuenta de un cliente.
//
// Este fichero es la UNICA implementacion del calculo economico compartible.
// Lo consumen el frontend (pantalla, PDF, WhatsApp) y la Edge Function que
// envia el email, para que el saldo que ve el cliente en pantalla y el que le
// llega por correo no puedan divergir jamas.
//
// Por eso NO TIENE NINGUN IMPORT: asi Deno lo carga tal cual y Vite tambien,
// sin alias ni configuracion de build. Los tipos son estructurales a proposito.
// Si anades un import aqui, rompes uno de los dos lados.

export const STORE_TIME_ZONE = 'Europe/Madrid'
export const OVERDUE_THRESHOLD_DAYS = 7

export type SummaryTicket = {
  amount_cents: number
  status: 'active' | 'voided'
  origin?: 'purchase' | 'opening_balance' | null
  concept?: string | null
  created_at: string
}

export type SummaryPayment = {
  amount_cents: number
  voided_at: string | null
  created_at: string
}

export type DebtSlice = {
  at: string
  remainingCents: number
  isOpeningBalance: boolean
}

export type AgingResult = {
  balance: number
  slices: DebtSlice[]
  oldestAt: string | null
  oldestCents: number
  ageInDays: number | null
  approximate: boolean
}

const EMPTY_AGING: AgingResult = { balance: 0, slices: [], oldestAt: null, oldestCents: 0, ageInDays: null, approximate: false }

/** Fecha civil `AAAA-MM-DD` en la zona de la tienda. */
function storeDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

/**
 * Dias naturales completos entre dos instantes segun el calendario de la tienda.
 * Se comparan fechas civiles, no se restan horas: asi el cambio de hora no
 * descuadra nada y `7 dias` significa lo mismo a las 9:00 que a las 23:00.
 */
export function daysBetweenInStoreZone(fromISO: string, to: Date): number {
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  const [fy, fm, fd] = storeDate(from).split('-').map(Number)
  const [ty, tm, td] = storeDate(to).split('-').map(Number)
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.max(0, Math.round(diff / 86400000))
}

/**
 * Imputa los pagos a la deuda mas antigua primero (FIFO) y devuelve los tramos
 * que siguen vivos. Derivado, sin estado persistido: anular un pago o un ticket
 * rehace el resultado solo.
 */
export function computeAging(tickets: SummaryTicket[], payments: SummaryPayment[], now: Date): AgingResult {
  const debts = tickets
    .filter((ticket) => ticket.status === 'active')
    .map((ticket, index) => ({ ticket, index }))
    .sort((a, b) => a.ticket.created_at.localeCompare(b.ticket.created_at) || a.index - b.index)

  let credit = payments.filter((payment) => payment.voided_at === null).reduce((total, payment) => total + payment.amount_cents, 0)

  const slices: DebtSlice[] = []
  for (const { ticket } of debts) {
    const covered = Math.min(credit, ticket.amount_cents)
    credit -= covered
    const remainingCents = ticket.amount_cents - covered
    if (remainingCents > 0) {
      slices.push({ at: ticket.created_at, remainingCents, isOpeningBalance: ticket.origin === 'opening_balance' })
    }
  }

  const oldest = slices[0]
  if (!oldest) return { ...EMPTY_AGING, slices: [] }

  return {
    balance: slices.reduce((total, slice) => total + slice.remainingCents, 0),
    slices,
    oldestAt: oldest.at,
    oldestCents: oldest.remainingCents,
    ageInDays: daysBetweenInStoreZone(oldest.at, now),
    // La fecha de un saldo anterior es la del registro, no la real.
    approximate: oldest.isOpeningBalance,
  }
}

export function isOverdue(aging: AgingResult, thresholdDays = OVERDUE_THRESHOLD_DAYS): boolean {
  return aging.ageInDays !== null && aging.ageInDays > thresholdDays
}

// ---------------------------------------------------------------------------
// Modelo compartible
// ---------------------------------------------------------------------------

export type ShareMovementKind = 'purchase' | 'opening_balance' | 'payment'

export type ShareMovement = {
  kind: ShareMovementKind
  /** `dd/mm/aaaa` en la zona de la tienda. */
  date: string
  /** `dd/mm`, para canales donde el ano se sobreentiende. */
  shortDate: string
  /** `Compra`, `Saldo anterior` o `Pago`. */
  label: string
  amountCents: number
  /** Importe ya formateado, con signo negativo en los pagos. */
  amount: string
  concept: string | null
}

/**
 * Todo lo que puede salir de la tienda sobre una cuenta.
 *
 * Es compartible POR CONSTRUCCION: aqui no entran identificadores, ni la nota
 * privada, ni el apodo, ni rutas de ficheros, ni nada de otros clientes. Lo que
 * no esta en este tipo no puede escaparse por descuido en un email, un PDF o un
 * WhatsApp.
 */
export type AccountSummary = {
  storeName: string
  storeLocation: string
  clientName: string
  /** Fecha del resumen, `dd/mm/aaaa`. */
  date: string
  movements: ShareMovement[]
  balanceCents: number
  balance: string
  /** `Pendiente desde hace 15 días` / `... al menos 15 días`, o null si no procede. */
  agingLine: string | null
  hasOpeningBalance: boolean
}

export function formatCents(cents: number): string {
  const negative = cents < 0
  const units = Math.abs(Math.trunc(cents))
  const euros = Math.floor(units / 100)
  const rest = String(units % 100).padStart(2, '0')
  // Separador de millares con punto y decimales con coma, formato espanol.
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${grouped},${rest} €`
}

function spanishDate(iso: string): string {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return ''
  const [year, month, day] = storeDate(value).split('-')
  return `${day}/${month}/${year}`
}

function shortSpanishDate(iso: string): string {
  return spanishDate(iso).slice(0, 5)
}

function movementLabel(kind: ShareMovementKind): string {
  if (kind === 'opening_balance') return 'Saldo anterior'
  return kind === 'payment' ? 'Pago' : 'Compra'
}

export function buildAccountSummary(
  input: { clientName: string; storeName?: string; storeLocation?: string },
  tickets: SummaryTicket[],
  payments: SummaryPayment[],
  now: Date,
): AccountSummary {
  // Solo la cuenta vigente: un movimiento anulado no se comparte como vivo.
  const activeTickets = tickets.filter((ticket) => ticket.status === 'active')
  const activePayments = payments.filter((payment) => payment.voided_at === null)
  const aging = computeAging(tickets, payments, now)

  const movements: ShareMovement[] = [
    ...activeTickets.map((ticket) => {
      const kind: ShareMovementKind = ticket.origin === 'opening_balance' ? 'opening_balance' : 'purchase'
      return {
        kind,
        date: spanishDate(ticket.created_at),
        shortDate: shortSpanishDate(ticket.created_at),
        label: movementLabel(kind),
        amountCents: ticket.amount_cents,
        amount: formatCents(ticket.amount_cents),
        concept: ticket.concept ?? null,
      }
    }),
    ...activePayments.map((payment) => ({
      kind: 'payment' as const,
      date: spanishDate(payment.created_at),
      shortDate: shortSpanishDate(payment.created_at),
      label: movementLabel('payment'),
      amountCents: -payment.amount_cents,
      amount: formatCents(-payment.amount_cents),
      concept: null,
    })),
  ].sort((a, b) => a.date.split('/').reverse().join('').localeCompare(b.date.split('/').reverse().join('')))

  const days = aging.ageInDays
  const agingLine = days !== null && aging.balance > 0
    ? `Pendiente desde hace ${aging.approximate ? 'al menos ' : ''}${days} ${days === 1 ? 'día' : 'días'}`
    : null

  return {
    storeName: input.storeName ?? 'La Libreta de Marcos',
    storeLocation: input.storeLocation ?? 'Covirán · San Miguel de las Dueñas',
    clientName: input.clientName,
    date: spanishDate(now.toISOString()),
    movements,
    balanceCents: aging.balance,
    balance: formatCents(aging.balance),
    agingLine,
    hasOpeningBalance: activeTickets.some((ticket) => ticket.origin === 'opening_balance'),
  }
}
