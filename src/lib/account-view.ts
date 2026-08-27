import type { Client, ClientSummary, Payment, Ticket } from './data'
import { computeAging } from './aging'

/**
 * Modelo unico de `Ver cuenta`.
 *
 * Es deliberadamente COMPARTIBLE: no lleva identificadores tecnicos, ni la nota
 * privada del cliente, ni su apodo, ni nada de otros clientes. Asi el dia que se
 * reutilice para email, PDF o WhatsApp no hay que acordarse de filtrar nada: lo
 * que no esta aqui, no puede escaparse. La pantalla usa este modelo para todas
 * las cifras y mantiene aparte su propia lista para poder abrir un movimiento.
 */
export type AccountViewMovement = {
  kind: 'purchase' | 'opening_balance' | 'payment'
  at: string
  amountCents: number
  concept: string | null
}

export type AccountView = {
  clientName: string
  clientEmail: string | null
  hasPhoto: boolean
  balanceCents: number
  totalChargedCents: number
  totalPaidCents: number
  /** Movimientos vivos, del mas reciente al mas antiguo. */
  movements: AccountViewMovement[]
  oldestAt: string | null
  ageInDays: number | null
  /** true cuando la antiguedad es una cota inferior porque nace de un saldo anterior. */
  ageApproximate: boolean
}

export function buildAccountView(client: Client | ClientSummary, tickets: Ticket[], payments: Payment[], now: Date): AccountView {
  const activeTickets = tickets.filter((ticket) => ticket.status === 'active')
  const activePayments = payments.filter((payment) => payment.voided_at === null)
  const aging = computeAging(tickets, payments, now)

  const movements: AccountViewMovement[] = [
    ...activeTickets.map((ticket) => ({
      kind: (ticket.origin === 'opening_balance' ? 'opening_balance' : 'purchase') as AccountViewMovement['kind'],
      at: ticket.created_at,
      amountCents: ticket.amount_cents,
      concept: ticket.concept,
    })),
    ...activePayments.map((payment) => ({
      kind: 'payment' as const,
      at: payment.created_at,
      amountCents: payment.amount_cents,
      concept: null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return {
    clientName: client.name,
    clientEmail: client.email ?? null,
    hasPhoto: Boolean(client.photo_path),
    balanceCents: aging.balance,
    totalChargedCents: activeTickets.reduce((total, ticket) => total + ticket.amount_cents, 0),
    totalPaidCents: activePayments.reduce((total, payment) => total + payment.amount_cents, 0),
    movements,
    oldestAt: aging.oldestAt,
    ageInDays: aging.ageInDays,
    ageApproximate: aging.approximate,
  }
}
