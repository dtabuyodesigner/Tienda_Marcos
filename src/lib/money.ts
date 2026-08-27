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
export type SearchableClient = { name: string }

export function calculateActiveBalance(tickets: BalanceTicket[], payments: BalancePayment[]): number {
  return calculateBalance(
    tickets.filter((ticket) => ticket.status === 'active').map((ticket) => ticket.amount_cents),
    payments.filter((payment) => !payment.voided_at).map((payment) => payment.amount_cents),
  )
}

export function canRegisterPayment(balance: number, amountCents: number): boolean {
  return amountCents > 0 && amountCents <= balance
}

export function searchClients<T extends SearchableClient>(clients: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('es-ES')
  if (!normalizedQuery) return clients
  return clients.filter((client) => client.name.toLocaleLowerCase('es-ES').includes(normalizedQuery))
}
