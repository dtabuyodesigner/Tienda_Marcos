import { describe, expect, it } from 'vitest'
import type { Payment, Ticket } from './data'
import { buildStoreOverview } from './overview'

const AHORA = new Date('2026-08-27T10:00:00Z')

function ticket(values: Partial<Ticket> & Pick<Ticket, 'id' | 'client_id' | 'amount_cents'>): Ticket {
  return { store_id: 's', concept: null, photo_path: null, status: 'active', origin: 'purchase', created_by: 'u', created_at: '2026-08-20T10:00:00Z', voided_at: null, voided_by: null, void_reason: null, ...values }
}
function payment(values: Partial<Payment> & Pick<Payment, 'id' | 'client_id' | 'amount_cents'>): Payment {
  return { store_id: 's', created_by: 'u', created_at: '2026-08-20T10:00:00Z', voided_at: null, voided_by: null, void_reason: null, ...values }
}
const CLIENTES = [{ id: 'ana', name: 'Ana' }, { id: 'bruno', name: 'Bruno' }, { id: 'cris', name: 'Cris' }]

describe('resumen global de la tienda', () => {
  it('sin movimientos no hay nada pendiente', () => {
    const o = buildStoreOverview(CLIENTES, [], [], AHORA)
    expect(o).toMatchObject({ totalPendingCents: 0, clientsWithDebt: 0, overdueCount: 0, overdueCents: 0, monthPurchaseCount: 0, monthPaymentCount: 0 })
    expect(o.overdueAccounts).toEqual([])
  })

  it('suma el pendiente y cuenta solo clientes que deben algo', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 't1', client_id: 'ana', amount_cents: 2000 }),
      ticket({ id: 't2', client_id: 'bruno', amount_cents: 1000 }),
    ], [payment({ id: 'p1', client_id: 'bruno', amount_cents: 1000 })], AHORA)

    expect(o.totalPendingCents).toBe(2000)
    expect(o.clientsWithDebt).toBe(1)
  })

  it('cuenta como antiguas solo las cuentas que pasan del umbral', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'viejo', client_id: 'ana', amount_cents: 7900, created_at: '2026-08-15T10:00:00Z' }),
      ticket({ id: 'reciente', client_id: 'bruno', amount_cents: 1000, created_at: '2026-08-26T10:00:00Z' }),
    ], [], AHORA)

    expect(o.overdueCount).toBe(1)
    expect(o.overdueAccounts[0]).toMatchObject({ name: 'Ana', balanceCents: 7900, ageInDays: 12, approximate: false })
  })

  it('la deuda antigua cuenta solo los tramos viejos, no el saldo entero', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'viejo', client_id: 'ana', amount_cents: 2000, created_at: '2026-08-10T10:00:00Z' }),
      ticket({ id: 'nuevo', client_id: 'ana', amount_cents: 5000, created_at: '2026-08-27T09:00:00Z' }),
    ], [], AHORA)

    expect(o.totalPendingCents).toBe(7000)
    expect(o.overdueCents).toBe(2000)
    expect(o.overdueAccounts[0].balanceCents).toBe(7000)
  })

  it('una compra reciente no rejuvenece la deuda antigua de la cuenta', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'julio', client_id: 'ana', amount_cents: 2000, created_at: '2026-07-27T10:00:00Z' }),
      ticket({ id: 'agosto', client_id: 'ana', amount_cents: 1000, created_at: '2026-08-25T10:00:00Z' }),
    ], [payment({ id: 'p', client_id: 'ana', amount_cents: 1500 })], AHORA)

    expect(o.overdueAccounts[0].ageInDays).toBe(31)
    expect(o.totalPendingCents).toBe(1500)
  })

  it('marca como aproximada la antiguedad que nace de un saldo anterior', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'ob', client_id: 'ana', amount_cents: 8640, origin: 'opening_balance', created_at: '2026-08-15T10:00:00Z' }),
    ], [], AHORA)

    expect(o.overdueAccounts[0]).toMatchObject({ approximate: true, ageInDays: 12 })
  })

  it('las cuentas antiguas salen de mas antigua a mas reciente', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'a', client_id: 'ana', amount_cents: 100, created_at: '2026-08-15T10:00:00Z' }),
      ticket({ id: 'b', client_id: 'bruno', amount_cents: 100, created_at: '2026-08-01T10:00:00Z' }),
      ticket({ id: 'c', client_id: 'cris', amount_cents: 100, created_at: '2026-08-10T10:00:00Z' }),
    ], [], AHORA)

    expect(o.overdueAccounts.map((cuenta) => cuenta.name)).toEqual(['Bruno', 'Cris', 'Ana'])
  })

  it('cuenta compras y cobros del mes en curso y excluye anulados', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'mes', client_id: 'ana', amount_cents: 2000, created_at: '2026-08-05T10:00:00Z' }),
      ticket({ id: 'anulado', client_id: 'ana', amount_cents: 9999, status: 'voided', created_at: '2026-08-06T10:00:00Z' }),
      ticket({ id: 'mes-pasado', client_id: 'ana', amount_cents: 3000, created_at: '2026-07-30T10:00:00Z' }),
    ], [
      payment({ id: 'pm', client_id: 'ana', amount_cents: 500, created_at: '2026-08-07T10:00:00Z' }),
      payment({ id: 'pa', client_id: 'ana', amount_cents: 700, created_at: '2026-08-08T10:00:00Z', voided_at: '2026-08-09T10:00:00Z' }),
    ], AHORA)

    expect(o.monthPurchaseCount).toBe(1)
    expect(o.monthPurchaseCents).toBe(2000)
    expect(o.monthPaymentCount).toBe(1)
    expect(o.monthPaymentCents).toBe(500)
  })

  it('un saldo anterior no cuenta como compra del mes aunque se apunte este mes', () => {
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'ob', client_id: 'ana', amount_cents: 8640, origin: 'opening_balance', created_at: '2026-08-05T10:00:00Z' }),
    ], [], AHORA)

    expect(o.monthPurchaseCount).toBe(0)
    expect(o.monthPurchaseCents).toBe(0)
    expect(o.totalPendingCents).toBe(8640)
  })

  it('el corte de mes usa el calendario de la tienda, no UTC', () => {
    // 31 de agosto a las 23:30 UTC ya es 1 de septiembre en Madrid.
    const o = buildStoreOverview(CLIENTES, [
      ticket({ id: 'sept', client_id: 'ana', amount_cents: 1000, created_at: '2026-08-31T23:30:00Z' }),
    ], [], new Date('2026-09-01T08:00:00Z'))

    expect(o.monthPurchaseCount).toBe(1)
  })
})
