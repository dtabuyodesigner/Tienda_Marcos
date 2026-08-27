import { describe, expect, it } from 'vitest'
import type { Payment, Ticket } from './data'
import { agingSentence, OVERDUE_THRESHOLD_DAYS, computeAging, daysBetweenInStoreZone, isOverdue } from './aging'

function ticket(id: string, amount_cents: number, created_at: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    store_id: 'store-1',
    client_id: 'client-1',
    amount_cents,
    concept: null,
    photo_path: null,
    status: 'active',
    origin: 'purchase',
    created_by: 'user-1',
    created_at,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...overrides,
  }
}

function payment(id: string, amount_cents: number, created_at: string, overrides: Partial<Payment> = {}): Payment {
  return {
    id,
    store_id: 'store-1',
    client_id: 'client-1',
    amount_cents,
    created_by: 'user-1',
    created_at,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...overrides,
  }
}

const JULY = '2025-07-27T10:00:00.000Z'
const AUGUST = '2025-08-25T10:00:00.000Z'
const NOW = new Date('2025-08-27T10:00:00.000Z')

describe('computeAging', () => {
  it('deja viva una compra sin pagos', () => {
    const aging = computeAging([ticket('t1', 2000, JULY)], [], NOW)
    expect(aging.balance).toBe(2000)
    expect(aging.slices).toEqual([{ at: JULY, remainingCents: 2000, isOpeningBalance: false }])
    expect(aging.oldestAt).toBe(JULY)
    expect(aging.oldestCents).toBe(2000)
    expect(aging.ageInDays).toBe(31)
    expect(aging.approximate).toBe(false)
  })

  it('no deja antiguedad cuando la compra esta pagada entera', () => {
    const aging = computeAging([ticket('t1', 2000, JULY)], [payment('p1', 2000, AUGUST)], NOW)
    expect(aging).toEqual({ balance: 0, slices: [], oldestAt: null, oldestCents: 0, ageInDays: null, approximate: false })
  })

  it('imputa el pago parcial a la deuda mas antigua (ejemplo canonico)', () => {
    const aging = computeAging([ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)], [payment('p1', 1500, AUGUST)], NOW)
    expect(aging.balance).toBe(1500)
    expect(aging.slices).toEqual([
      { at: JULY, remainingCents: 500, isOpeningBalance: false },
      { at: AUGUST, remainingCents: 1000, isOpeningBalance: false },
    ])
    expect(aging.oldestAt).toBe(JULY)
    expect(aging.oldestCents).toBe(500)
    expect(aging.ageInDays).toBe(31)
  })

  it('una compra reciente no rejuvenece la deuda antigua', () => {
    const soloVieja = computeAging([ticket('t1', 2000, JULY)], [], NOW)
    const conCompraNueva = computeAging([ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)], [], NOW)
    expect(conCompraNueva.oldestAt).toBe(soloVieja.oldestAt)
    expect(conCompraNueva.ageInDays).toBe(soloVieja.ageInDays)
    expect(conCompraNueva.balance).toBe(3000)
  })

  it('pasa la antiguedad a la segunda compra cuando el pago cubre justo la primera', () => {
    const aging = computeAging([ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)], [payment('p1', 2000, AUGUST)], NOW)
    expect(aging.slices).toEqual([{ at: AUGUST, remainingCents: 1000, isOpeningBalance: false }])
    expect(aging.oldestAt).toBe(AUGUST)
    expect(aging.ageInDays).toBe(2)
  })

  it('consume la primera compra y parte de la segunda', () => {
    const aging = computeAging([ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)], [payment('p1', 2400, AUGUST)], NOW)
    expect(aging.balance).toBe(600)
    expect(aging.slices).toEqual([{ at: AUGUST, remainingCents: 600, isOpeningBalance: false }])
  })

  it('suma varios pagos en un unico credito', () => {
    const aging = computeAging(
      [ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)],
      [payment('p1', 500, JULY), payment('p2', 700, AUGUST), payment('p3', 300, AUGUST)],
      NOW,
    )
    expect(aging.balance).toBe(1500)
    expect(aging.slices).toEqual([
      { at: JULY, remainingCents: 500, isOpeningBalance: false },
      { at: AUGUST, remainingCents: 1000, isOpeningBalance: false },
    ])
  })

  it('ignora los tickets anulados', () => {
    const aging = computeAging([ticket('t1', 2000, JULY, { status: 'voided' }), ticket('t2', 1000, AUGUST)], [], NOW)
    expect(aging.balance).toBe(1000)
    expect(aging.oldestAt).toBe(AUGUST)
  })

  it('ignora los pagos anulados y devuelve la deuda antigua a la vida', () => {
    const tickets = [ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)]
    const vivo = computeAging(tickets, [payment('p1', 2000, AUGUST)], NOW)
    expect(vivo.oldestAt).toBe(AUGUST)

    const anulado = computeAging(tickets, [payment('p1', 2000, AUGUST, { voided_at: '2025-08-26T10:00:00.000Z' })], NOW)
    expect(anulado.balance).toBe(3000)
    expect(anulado.oldestAt).toBe(JULY)
  })

  it('marca approximate cuando solo hay saldo anterior', () => {
    const aging = computeAging([ticket('t1', 5000, JULY, { origin: 'opening_balance' })], [], NOW)
    expect(aging.approximate).toBe(true)
    expect(aging.slices[0].isOpeningBalance).toBe(true)
  })

  it('deja de aproximar cuando el pago cubre entero el saldo anterior', () => {
    const tickets = [ticket('t1', 5000, JULY, { origin: 'opening_balance' }), ticket('t2', 1000, AUGUST)]
    expect(computeAging(tickets, [], NOW).approximate).toBe(true)
    expect(computeAging(tickets, [payment('p1', 4000, AUGUST)], NOW).approximate).toBe(true)

    const cubierto = computeAging(tickets, [payment('p1', 5000, AUGUST)], NOW)
    expect(cubierto.approximate).toBe(false)
    expect(cubierto.oldestAt).toBe(AUGUST)
  })

  it('mantiene la aproximacion con un saldo anterior pagado a medias', () => {
    const aging = computeAging([ticket('t1', 5000, JULY, { origin: 'opening_balance' })], [payment('p1', 1500, AUGUST)], NOW)
    expect(aging.balance).toBe(3500)
    expect(aging.oldestCents).toBe(3500)
    expect(aging.approximate).toBe(true)
  })

  it('trata un ticket sin origin como compra normal', () => {
    const aging = computeAging([ticket('t1', 2000, JULY, { origin: undefined })], [], NOW)
    expect(aging.approximate).toBe(false)
  })

  it('nunca devuelve saldo negativo aunque los pagos superen la deuda', () => {
    const aging = computeAging([ticket('t1', 1000, JULY)], [payment('p1', 4000, AUGUST)], NOW)
    expect(aging).toEqual({ balance: 0, slices: [], oldestAt: null, oldestCents: 0, ageInDays: null, approximate: false })
  })

  it('devuelve saldo cero sin movimientos', () => {
    expect(computeAging([], [], NOW).balance).toBe(0)
    expect(computeAging([], [payment('p1', 500, AUGUST)], NOW).balance).toBe(0)
  })

  it('cuadra siempre balance con la suma de los tramos', () => {
    const casos: Array<[Ticket[], Payment[]]> = [
      [[ticket('t1', 2000, JULY), ticket('t2', 1000, AUGUST)], [payment('p1', 1500, AUGUST)]],
      [[ticket('t1', 5000, JULY, { origin: 'opening_balance' }), ticket('t2', 333, AUGUST)], [payment('p1', 4999, AUGUST)]],
      [[ticket('t1', 100, JULY), ticket('t2', 200, AUGUST), ticket('t3', 300, AUGUST)], [payment('p1', 250, AUGUST)]],
      [[ticket('t1', 1000, JULY)], []],
    ]
    for (const [tickets, payments] of casos) {
      const aging = computeAging(tickets, payments, NOW)
      expect(aging.balance).toBe(aging.slices.reduce((total, slice) => total + slice.remainingCents, 0))
      expect(aging.slices.every((slice) => slice.remainingCents > 0)).toBe(true)
    }
  })

  it('ordena los tramos del mas antiguo al mas reciente aunque lleguen desordenados', () => {
    const aging = computeAging([ticket('t2', 1000, AUGUST), ticket('t1', 2000, JULY)], [], NOW)
    expect(aging.slices.map((slice) => slice.at)).toEqual([JULY, AUGUST])
  })

  it('no muta los arrays de entrada', () => {
    const tickets = [ticket('t2', 1000, AUGUST), ticket('t1', 2000, JULY)]
    const payments = [payment('p1', 100, AUGUST)]
    computeAging(tickets, payments, NOW)
    expect(tickets.map((item) => item.id)).toEqual(['t2', 't1'])
    expect(payments).toHaveLength(1)
  })
})

describe('isOverdue', () => {
  const base = '2025-08-01T10:00:00.000Z'
  const agingAt = (nowISO: string) => computeAging([ticket('t1', 1000, base)], [], new Date(nowISO))

  it('no marca vencido a los 6 ni a los 7 dias, si a los 8', () => {
    expect(agingAt('2025-08-07T10:00:00.000Z').ageInDays).toBe(6)
    expect(isOverdue(agingAt('2025-08-07T10:00:00.000Z'))).toBe(false)
    expect(agingAt('2025-08-08T10:00:00.000Z').ageInDays).toBe(7)
    expect(isOverdue(agingAt('2025-08-08T10:00:00.000Z'))).toBe(false)
    expect(agingAt('2025-08-09T10:00:00.000Z').ageInDays).toBe(8)
    expect(isOverdue(agingAt('2025-08-09T10:00:00.000Z'))).toBe(true)
  })

  it('acepta un umbral propio y usa 7 por defecto', () => {
    expect(OVERDUE_THRESHOLD_DAYS).toBe(7)
    expect(isOverdue(agingAt('2025-08-04T10:00:00.000Z'), 2)).toBe(true)
    expect(isOverdue(agingAt('2025-08-03T10:00:00.000Z'), 2)).toBe(false)
  })

  it('no marca vencido sin deuda', () => {
    expect(isOverdue(computeAging([], [], NOW))).toBe(false)
  })
})

describe('daysBetweenInStoreZone', () => {
  it('compara dias civiles de Madrid, no instantes', () => {
    // 21:30Z y 22:30Z son el mismo dia UTC, pero en verano Madrid va +2: 23:30 del 27 y 00:30 del 28.
    expect(daysBetweenInStoreZone('2025-07-27T21:30:00.000Z', new Date('2025-07-27T22:30:00.000Z'))).toBe(1)
    // Y una hora larga dentro del mismo dia civil de Madrid sigue siendo 0 dias.
    expect(daysBetweenInStoreZone('2025-07-27T06:00:00.000Z', new Date('2025-07-27T20:00:00.000Z'))).toBe(0)
  })

  it('cuenta igual a las 9:00 que a las 23:00', () => {
    expect(daysBetweenInStoreZone('2025-08-01T07:00:00.000Z', new Date('2025-08-08T07:00:00.000Z'))).toBe(7)
    expect(daysBetweenInStoreZone('2025-08-01T21:00:00.000Z', new Date('2025-08-08T07:00:00.000Z'))).toBe(7)
  })

  it('cruza el cambio de mes', () => {
    expect(daysBetweenInStoreZone('2025-07-27T10:00:00.000Z', new Date('2025-08-02T10:00:00.000Z'))).toBe(6)
    expect(daysBetweenInStoreZone('2025-01-30T10:00:00.000Z', new Date('2025-03-02T10:00:00.000Z'))).toBe(31)
  })

  it('no se descuadra con el cambio de hora', () => {
    // La madrugada del 30 de marzo de 2025 Madrid pasa de +1 a +2: sigue siendo un dia.
    expect(daysBetweenInStoreZone('2025-03-29T12:00:00.000Z', new Date('2025-03-30T12:00:00.000Z'))).toBe(1)
    // Y el 26 de octubre vuelve a +1: tambien un dia.
    expect(daysBetweenInStoreZone('2025-10-25T12:00:00.000Z', new Date('2025-10-26T12:00:00.000Z'))).toBe(1)
  })

  it('devuelve 0 con fechas futuras, nunca negativo', () => {
    expect(daysBetweenInStoreZone('2026-01-01T10:00:00.000Z', new Date('2025-08-27T10:00:00.000Z'))).toBe(0)
    expect(computeAging([ticket('t1', 1000, '2026-01-01T10:00:00.000Z')], [], NOW).ageInDays).toBe(0)
  })
})

describe('frase de antiguedad', () => {
  it('a los cero dias dice hoy, no "hace 0 dias"', () => {
    expect(agingSentence(0, false)).toBe('Pendiente desde hoy')
  })

  it('un dia va en singular', () => {
    expect(agingSentence(1, false)).toBe('Pendiente desde hace 1 día')
  })

  it('a partir de dos dias va en plural', () => {
    expect(agingSentence(2, false)).toBe('Pendiente desde hace 2 días')
    expect(agingSentence(15, false)).toBe('Pendiente desde hace 15 días')
  })

  it('el saldo anterior conserva la semantica de cota inferior', () => {
    expect(agingSentence(15, true)).toBe('Pendiente desde hace al menos 15 días')
    expect(agingSentence(1, true)).toBe('Pendiente desde hace al menos 1 día')
  })

  it('para un saldo anterior de hoy evita el "al menos 0 dias" artificial', () => {
    expect(agingSentence(0, true)).toBe('Pendiente desde hoy o antes')
    expect(agingSentence(0, true)).not.toContain('0 días')
  })

  it('nunca dice "hace 0"', () => {
    for (const aprox of [true, false]) {
      expect(agingSentence(0, aprox)).not.toContain('hace 0')
      expect(agingSentence(-3, aprox)).not.toContain('hace')
    }
  })
})
