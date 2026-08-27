import { describe, expect, it } from 'vitest'
import type { Client, Payment, Ticket } from './data'
import { buildAccountView } from './account-view'

const AHORA = new Date('2026-08-27T10:00:00Z')
const CLIENTE = { id: 'cli-9f3a7', store_id: 's', name: 'Ana', phone: null, nickname: 'la del quiosco', note: 'nota privada', email: 'ana@example.com', photo_path: 'p.jpg', active: true } as Client

function ticket(values: Partial<Ticket> & Pick<Ticket, 'id' | 'amount_cents'>): Ticket {
  return { store_id: 's', client_id: 'ana', concept: null, photo_path: null, status: 'active', origin: 'purchase', created_by: 'u', created_at: '2026-08-20T10:00:00Z', voided_at: null, voided_by: null, void_reason: null, ...values }
}
function payment(values: Partial<Payment> & Pick<Payment, 'id' | 'amount_cents'>): Payment {
  return { store_id: 's', client_id: 'ana', created_by: 'u', created_at: '2026-08-21T10:00:00Z', voided_at: null, voided_by: null, void_reason: null, ...values }
}

describe('modelo unico de Ver cuenta', () => {
  it('reune cliente, saldo, totales y movimientos vivos', () => {
    const vista = buildAccountView(CLIENTE, [
      ticket({ id: 't1', amount_cents: 2000, concept: 'Pan y leche' }),
      ticket({ id: 't2', amount_cents: 1000, created_at: '2026-08-25T10:00:00Z' }),
    ], [payment({ id: 'p1', amount_cents: 500 })], AHORA)

    expect(vista.clientName).toBe('Ana')
    expect(vista.clientEmail).toBe('ana@example.com')
    expect(vista.hasPhoto).toBe(true)
    expect(vista.balanceCents).toBe(2500)
    expect(vista.totalChargedCents).toBe(3000)
    expect(vista.totalPaidCents).toBe(500)
    expect(vista.movements).toHaveLength(3)
  })

  it('es compartible por construccion: sin nota privada, sin apodo y sin identificadores', () => {
    const vista = buildAccountView(CLIENTE, [ticket({ id: 't1', amount_cents: 2000 })], [], AHORA)
    const serializado = JSON.stringify(vista)

    expect(serializado).not.toContain('nota privada')
    expect(serializado).not.toContain('la del quiosco')
    expect(serializado).not.toContain('cli-9f3a7')
    expect(serializado).not.toContain('t1')
    expect(Object.keys(vista.movements[0])).toEqual(['kind', 'at', 'amountCents', 'concept'])
  })

  it('ordena los movimientos del mas reciente al mas antiguo', () => {
    const vista = buildAccountView(CLIENTE, [
      ticket({ id: 'viejo', amount_cents: 100, created_at: '2026-08-01T10:00:00Z' }),
      ticket({ id: 'nuevo', amount_cents: 200, created_at: '2026-08-26T10:00:00Z' }),
    ], [payment({ id: 'p', amount_cents: 50, created_at: '2026-08-10T10:00:00Z' })], AHORA)

    expect(vista.movements.map((m) => m.at)).toEqual(['2026-08-26T10:00:00Z', '2026-08-10T10:00:00Z', '2026-08-01T10:00:00Z'])
  })

  it('excluye anulados de movimientos y totales', () => {
    const vista = buildAccountView(CLIENTE, [
      ticket({ id: 'ok', amount_cents: 2000 }),
      ticket({ id: 'anulado', amount_cents: 9999, status: 'voided' }),
    ], [
      payment({ id: 'ok', amount_cents: 500 }),
      payment({ id: 'anulado', amount_cents: 700, voided_at: '2026-08-22T10:00:00Z' }),
    ], AHORA)

    expect(vista.totalChargedCents).toBe(2000)
    expect(vista.totalPaidCents).toBe(500)
    expect(vista.balanceCents).toBe(1500)
    expect(vista.movements).toHaveLength(2)
  })

  it('distingue el saldo anterior y avisa de que su antiguedad es una cota', () => {
    const vista = buildAccountView(CLIENTE, [
      ticket({ id: 'ob', amount_cents: 8640, origin: 'opening_balance', created_at: '2026-08-15T10:00:00Z' }),
    ], [], AHORA)

    expect(vista.movements[0].kind).toBe('opening_balance')
    expect(vista.ageInDays).toBe(12)
    expect(vista.ageApproximate).toBe(true)
  })

  it('sin deuda no inventa antiguedad', () => {
    const vista = buildAccountView(CLIENTE, [ticket({ id: 't', amount_cents: 1000 })], [payment({ id: 'p', amount_cents: 1000 })], AHORA)

    expect(vista.balanceCents).toBe(0)
    expect(vista.ageInDays).toBeNull()
    expect(vista.oldestAt).toBeNull()
  })

  it('un cliente sin email ni foto se representa igual de bien', () => {
    const vista = buildAccountView({ ...CLIENTE, email: null, photo_path: null }, [], [], AHORA)

    expect(vista.clientEmail).toBeNull()
    expect(vista.hasPhoto).toBe(false)
    expect(vista.movements).toEqual([])
  })
})
