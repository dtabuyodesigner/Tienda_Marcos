import { describe, expect, it } from 'vitest'
import { summarizeClientMovements } from './summary'
import type { Payment, Ticket } from './data'

function ticket(values: Partial<Ticket> & Pick<Ticket, 'id' | 'amount_cents'>): Ticket {
  return {
    store_id: 'store-1',
    client_id: 'client-1',
    concept: null,
    photo_path: null,
    status: 'active',
    origin: 'purchase',
    created_by: 'user-1',
    created_at: '2026-08-01T10:00:00Z',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...values,
  }
}

function payment(values: Partial<Payment> & Pick<Payment, 'id' | 'amount_cents'>): Payment {
  return {
    store_id: 'store-1',
    client_id: 'client-1',
    created_by: 'user-1',
    created_at: '2026-08-01T10:00:00Z',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...values,
  }
}

describe('summarizeClientMovements', () => {
  it('devuelve todo a cero para un cliente sin historial', () => {
    expect(summarizeClientMovements([], [])).toEqual({
      balance: 0,
      activeDebtMovements: 0,
      totalChargedActive: 0,
      totalPaidActive: 0,
      movementCount: 0,
      lastPurchaseAt: null,
      lastPaymentAt: null,
    })
  })

  it('cuenta el saldo anterior como movimiento de deuda pero no como compra', () => {
    const stats = summarizeClientMovements([ticket({ id: 't1', amount_cents: 4500, origin: 'opening_balance' })], [])
    expect(stats.balance).toBe(4500)
    expect(stats.totalChargedActive).toBe(4500)
    expect(stats.activeDebtMovements).toBe(1)
    expect(stats.lastPurchaseAt).toBeNull()
  })

  it('excluye compras anuladas del cobrado activo pero las mantiene en el historico', () => {
    const stats = summarizeClientMovements(
      [
        ticket({ id: 't1', amount_cents: 1000 }),
        ticket({ id: 't2', amount_cents: 2500, status: 'voided', voided_at: '2026-08-02T10:00:00Z' }),
      ],
      [],
    )
    expect(stats.totalChargedActive).toBe(1000)
    expect(stats.activeDebtMovements).toBe(1)
    expect(stats.movementCount).toBe(2)
    expect(stats.balance).toBe(1000)
  })

  it('excluye pagos anulados del pagado activo pero los mantiene en el historico', () => {
    const stats = summarizeClientMovements(
      [ticket({ id: 't1', amount_cents: 3000 })],
      [
        payment({ id: 'p1', amount_cents: 1000 }),
        payment({ id: 'p2', amount_cents: 800, voided_at: '2026-08-03T10:00:00Z' }),
      ],
    )
    expect(stats.totalPaidActive).toBe(1000)
    expect(stats.movementCount).toBe(3)
    expect(stats.balance).toBe(2000)
  })

  it('calcula el saldo intermedio con pagos parciales', () => {
    const stats = summarizeClientMovements(
      [ticket({ id: 't1', amount_cents: 5000 }), ticket({ id: 't2', amount_cents: 2500 })],
      [payment({ id: 'p1', amount_cents: 1500 }), payment({ id: 'p2', amount_cents: 1000 })],
    )
    expect(stats.totalChargedActive).toBe(7500)
    expect(stats.totalPaidActive).toBe(2500)
    expect(stats.balance).toBe(5000)
  })

  it('ignora el saldo anterior en lastPurchaseAt aunque sea el movimiento mas reciente', () => {
    const stats = summarizeClientMovements(
      [
        ticket({ id: 't1', amount_cents: 1000, created_at: '2026-08-01T10:00:00Z' }),
        ticket({ id: 't2', amount_cents: 9000, origin: 'opening_balance', created_at: '2026-08-20T10:00:00Z' }),
      ],
      [],
    )
    expect(stats.lastPurchaseAt).toBe('2026-08-01T10:00:00Z')
    expect(stats.activeDebtMovements).toBe(2)
  })

  it('ignora compras anuladas en lastPurchaseAt', () => {
    const stats = summarizeClientMovements(
      [
        ticket({ id: 't1', amount_cents: 1000, created_at: '2026-08-05T10:00:00Z' }),
        ticket({ id: 't2', amount_cents: 2000, created_at: '2026-08-18T10:00:00Z', status: 'voided', voided_at: '2026-08-19T10:00:00Z' }),
      ],
      [],
    )
    expect(stats.lastPurchaseAt).toBe('2026-08-05T10:00:00Z')
  })

  it('ignora pagos anulados en lastPaymentAt', () => {
    const stats = summarizeClientMovements(
      [ticket({ id: 't1', amount_cents: 5000 })],
      [
        payment({ id: 'p1', amount_cents: 1000, created_at: '2026-08-06T10:00:00Z' }),
        payment({ id: 'p2', amount_cents: 500, created_at: '2026-08-21T10:00:00Z', voided_at: '2026-08-22T10:00:00Z' }),
      ],
    )
    expect(stats.lastPaymentAt).toBe('2026-08-06T10:00:00Z')
  })

  it('trata un ticket sin origin como compra', () => {
    const stats = summarizeClientMovements([ticket({ id: 't1', amount_cents: 1200, origin: undefined, created_at: '2026-07-15T10:00:00Z' })], [])
    expect(stats.lastPurchaseAt).toBe('2026-07-15T10:00:00Z')
  })

  it('no depende del orden de llegada de los movimientos', () => {
    const stats = summarizeClientMovements(
      [
        ticket({ id: 't2', amount_cents: 2000, created_at: '2026-08-10T10:00:00Z' }),
        ticket({ id: 't1', amount_cents: 1000, created_at: '2026-08-25T10:00:00Z' }),
      ],
      [
        payment({ id: 'p2', amount_cents: 300, created_at: '2026-08-12T10:00:00Z' }),
        payment({ id: 'p1', amount_cents: 200, created_at: '2026-08-26T10:00:00Z' }),
      ],
    )
    expect(stats.lastPurchaseAt).toBe('2026-08-25T10:00:00Z')
    expect(stats.lastPaymentAt).toBe('2026-08-26T10:00:00Z')
  })

  it('mantiene el invariante balance = cobrado activo - pagado activo', () => {
    const stats = summarizeClientMovements(
      [
        ticket({ id: 't1', amount_cents: 7000, origin: 'opening_balance', created_at: '2026-07-01T10:00:00Z' }),
        ticket({ id: 't2', amount_cents: 1500 }),
        ticket({ id: 't3', amount_cents: 4000, status: 'voided', voided_at: '2026-08-04T10:00:00Z' }),
        ticket({ id: 't4', amount_cents: 900, origin: undefined }),
      ],
      [
        payment({ id: 'p1', amount_cents: 2000 }),
        payment({ id: 'p2', amount_cents: 1200, voided_at: '2026-08-08T10:00:00Z' }),
      ],
    )
    expect(stats.balance).toBe(stats.totalChargedActive - stats.totalPaidActive)
    expect(stats.movementCount).toBe(6)
    expect(stats.activeDebtMovements).toBe(3)
  })
})
