import { describe, expect, it } from 'vitest'
import { calculateActiveBalance, calculateBalance, canRegisterPayment, formatCents, parseEuroToCents, searchClients } from './money'

describe('money helpers', () => {
  it('converts euros to cents without floats', () => {
    expect(parseEuroToCents('18,40')).toBe(1840)
    expect(parseEuroToCents('18.40')).toBe(1840)
    expect(parseEuroToCents('7')).toBe(700)
    expect(parseEuroToCents('7,5')).toBe(750)
  })

  it('rejects invalid amounts before writing economic movements', () => {
    expect(parseEuroToCents('18,400')).toBeNull()
    expect(parseEuroToCents('-1')).toBeNull()
    expect(parseEuroToCents('0')).toBeNull()
    expect(parseEuroToCents('abc')).toBeNull()
    expect(parseEuroToCents('1,2,3')).toBeNull()
  })

  it('calculates balance from tickets and payments', () => {
    expect(calculateBalance([1840, 500], [700])).toBe(1640)
    expect(formatCents(1640)).toContain('16,40')
  })

  it('adds active tickets and ignores voided tickets', () => {
    expect(calculateActiveBalance([
      { amount_cents: 1840, status: 'active' },
      { amount_cents: 990, status: 'voided' },
      { amount_cents: 250, status: 'active' },
    ], [])).toBe(2090)
  })

  it('subtracts active payments and ignores voided payments', () => {
    expect(calculateActiveBalance([
      { amount_cents: 1840, status: 'active' },
      { amount_cents: 500, status: 'active' },
    ], [
      { amount_cents: 700, voided_at: null },
      { amount_cents: 400, voided_at: '2026-08-27T10:00:00Z' },
    ])).toBe(1640)
  })

  it('supports partial and total payments', () => {
    const balance = calculateActiveBalance([{ amount_cents: 1840, status: 'active' }], [])
    expect(canRegisterPayment(balance, 700)).toBe(true)
    expect(calculateBalance([balance], [700])).toBe(1140)
    expect(canRegisterPayment(balance, 1840)).toBe(true)
    expect(calculateBalance([balance], [1840])).toBe(0)
  })

  it('blocks payments that are zero, negative, or above the balance', () => {
    expect(canRegisterPayment(1840, 0)).toBe(false)
    expect(canRegisterPayment(1840, -1)).toBe(false)
    expect(canRegisterPayment(1840, 1841)).toBe(false)
  })

  it('searches clients by name without changing their balances', () => {
    const clients = [
      { name: 'Ana', balance: 1840 },
      { name: 'Marcos Perez', balance: 0 },
      { name: 'Maria Lopez', balance: 700 },
    ]
    expect(searchClients(clients, 'mar').map((client) => client.name)).toEqual(['Marcos Perez', 'Maria Lopez'])
    expect(searchClients(clients, '  PEREZ  ')).toEqual([{ name: 'Marcos Perez', balance: 0 }])
    expect(searchClients(clients, '')).toBe(clients)
  })
})
