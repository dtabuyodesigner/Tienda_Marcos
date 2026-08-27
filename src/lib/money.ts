export function parseEuroToCents(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [euros, decimals = ''] = normalized.split('.')
  const cents = Number(`${euros}${decimals.padEnd(2, '0')}`)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function formatCents(cents: number | bigint): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(cents) / 100)
}

export function calculateBalance(ticketAmounts: number[], paymentAmounts: number[]): number {
  return ticketAmounts.reduce((total, amount) => total + amount, 0) - paymentAmounts.reduce((total, amount) => total + amount, 0)
}

export type BalanceTicket = { amount_cents: number; status: 'active' | 'voided' }
export type BalancePayment = { amount_cents: number; voided_at: string | null }
export type SearchableClient = { name: string; nickname?: string | null }
export type OrderableClient = SearchableClient & { balance: number; lastActivityAt?: string | null }

export const HIGH_TICKET_CONFIRMATION_CENTS = 20000

export function calculateActiveBalance(tickets: BalanceTicket[], payments: BalancePayment[]): number {
  return calculateBalance(
    tickets.filter((ticket) => ticket.status === 'active').map((ticket) => ticket.amount_cents),
    payments.filter((payment) => !payment.voided_at).map((payment) => payment.amount_cents),
  )
}

export function canRegisterPayment(balance: number, amountCents: number): boolean {
  return amountCents > 0 && amountCents <= balance
}

/** `Cobrar` solo tiene sentido cuando queda deuda viva; con saldo cero no se ofrece la accion. */
export function canChargeClient(balance: number): boolean {
  return balance > 0
}

export function searchClients<T extends SearchableClient>(clients: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('es-ES')
  if (!normalizedQuery) return clients
  return clients.filter((client) => `${client.name} ${client.nickname ?? ''}`.toLocaleLowerCase('es-ES').includes(normalizedQuery))
}

export function sortClientsForHome<T extends OrderableClient>(clients: T[]): T[] {
  return [...clients].sort((a, b) => {
    const debtPriority = Number(b.balance > 0) - Number(a.balance > 0)
    if (debtPriority !== 0) return debtPriority
    const activityPriority = timestamp(b.lastActivityAt) - timestamp(a.lastActivityAt)
    if (activityPriority !== 0) return activityPriority
    return a.name.localeCompare(b.name, 'es-ES')
  })
}

export function recentClients<T extends OrderableClient>(clients: T[], limit = 5): T[] {
  return sortClientsForHome(clients.filter((client) => client.lastActivityAt)).slice(0, limit)
}

export function needsHighTicketConfirmation(amountCents: number): boolean {
  return amountCents > HIGH_TICKET_CONFIRMATION_CENTS
}

/**
 * Confirmacion antes de registrar deuda anterior a La Libreta.
 * Reutiliza el umbral de importe alto en el mismo aviso para no encadenar dos dialogos.
 */
export function openingBalanceConfirmation(name: string, amountCents: number): string {
  const base = `Vas a añadir ${formatCents(amountCents)} que ${name} ya debía anteriormente.`
  return needsHighTicketConfirmation(amountCents) ? `${base}\nEs un importe alto. Comprueba que es correcto.` : base
}

function timestamp(value?: string | null): number {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}
