// Import solo de tipos: `data.ts` instancia el cliente de Supabase al cargarse
// y este modulo debe seguir siendo puro (sin entorno, sin red).
import type { Payment, Ticket } from './data'
import { calculateActiveBalance } from './money'

export type ClientSummaryStats = {
  balance: number
  activeDebtMovements: number
  totalChargedActive: number
  totalPaidActive: number
  movementCount: number
  lastPurchaseAt: string | null
  lastPaymentAt: string | null
}

/**
 * Cifras de la ficha de cliente.
 * `activeDebtMovements` cuenta movimientos de deuda vivos (compras y saldo anterior),
 * no tickets impagados: el modelo no imputa pagos a tickets concretos.
 */
export function summarizeClientMovements(tickets: Ticket[], payments: Payment[]): ClientSummaryStats {
  const activeTickets = tickets.filter((ticket) => ticket.status === 'active')
  const activePayments = payments.filter((payment) => payment.voided_at === null)
  return {
    balance: calculateActiveBalance(tickets, payments),
    activeDebtMovements: activeTickets.length,
    totalChargedActive: sum(activeTickets),
    totalPaidActive: sum(activePayments),
    // Historico registrado: incluye anulados de ambos lados.
    movementCount: tickets.length + payments.length,
    lastPurchaseAt: latestCreatedAt(activeTickets.filter((ticket) => ticket.origin !== 'opening_balance')),
    lastPaymentAt: latestCreatedAt(activePayments),
  }
}

function sum(movements: { amount_cents: number }[]): number {
  return movements.reduce((total, movement) => total + movement.amount_cents, 0)
}

// Mismo criterio que `data.ts`: comparacion lexicografica sobre el ISO, sin parsear fechas.
function latestCreatedAt(movements: { created_at: string }[]): string | null {
  return movements.map((movement) => movement.created_at).sort((a, b) => b.localeCompare(a))[0] ?? null
}
