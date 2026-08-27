import type { Payment, Ticket } from './data'

/** El texto de la interfaz dice "llevan mas de 7 dias", asi que el umbral es estricto. */
export const OVERDUE_THRESHOLD_DAYS = 7
export const STORE_TIME_ZONE = 'Europe/Madrid'

export type DebtSlice = {
  at: string
  remainingCents: number
  isOpeningBalance: boolean
}

export type ClientAging = {
  balance: number
  slices: DebtSlice[]
  oldestAt: string | null
  oldestCents: number
  ageInDays: number | null
  approximate: boolean
}

const EMPTY_AGING: ClientAging = { balance: 0, slices: [], oldestAt: null, oldestCents: 0, ageInDays: null, approximate: false }

const storeDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Imputa los pagos a la deuda mas antigua primero, sin persistir nada:
 * todo se deriva de los movimientos vivos, asi que anular un pago o un
 * ticket rehace el calculo desde cero. Una compra nueva nunca rejuvenece
 * una deuda anterior que sigue viva.
 */
export function computeAging(tickets: Ticket[], payments: Payment[], now: Date): ClientAging {
  const debts = tickets
    .filter((ticket) => ticket.status === 'active')
    .map((ticket, index) => ({ ticket, index }))
    // Desempate por orden de entrada: `sort` es estable pero el indice lo deja explicito.
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
  if (!oldest) return { ...EMPTY_AGING }

  return {
    balance: slices.reduce((total, slice) => total + slice.remainingCents, 0),
    slices,
    oldestAt: oldest.at,
    oldestCents: oldest.remainingCents,
    ageInDays: daysBetweenInStoreZone(oldest.at, now),
    // La fecha de un saldo anterior es la del registro, no la real: solo podemos
    // afirmar "al menos" esos dias.
    approximate: oldest.isOpeningBalance,
  }
}

export function isOverdue(aging: ClientAging, thresholdDays = OVERDUE_THRESHOLD_DAYS): boolean {
  return aging.ageInDays !== null && aging.ageInDays > thresholdDays
}

/**
 * Dias naturales completos segun el calendario de la tienda: se comparan las
 * fechas civiles, no los instantes, para que "7 dias" signifique lo mismo a las
 * 9:00 que a las 23:00. Nada de desplazamientos fijos de horas, que se rompen
 * con el cambio de hora.
 */
export function daysBetweenInStoreZone(fromISO: string, to: Date): number {
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  const days = (civilDayNumber(to) - civilDayNumber(from)) / 86_400_000
  return Math.max(days, 0)
}

function civilDayNumber(date: Date): number {
  const [year, month, day] = storeDateFormatter.format(date).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
