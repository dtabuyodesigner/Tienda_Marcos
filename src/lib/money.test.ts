import { describe, expect, it } from 'vitest'
import {
  calculateActiveBalance,
  calculateBalance,
  canChargeClient,
  canRegisterPayment,
  formatCents,
  needsHighTicketConfirmation,
  openingBalanceConfirmation,
  parseEuroToCents,
  recentClients,
  searchClients,
  sortClientsForHome,
} from './money'

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

  it('searches clients by name and nickname without changing their balances', () => {
    const clients = [
      { name: 'Ana', nickname: null, balance: 1840 },
      { name: 'Marcos Perez', nickname: 'panadero', balance: 0 },
      { name: 'Maria Lopez', nickname: 'vecina plaza', balance: 700 },
    ]
    expect(searchClients(clients, 'mar').map((client) => client.name)).toEqual(['Marcos Perez', 'Maria Lopez'])
    expect(searchClients(clients, '  PEREZ  ')).toEqual([{ name: 'Marcos Perez', nickname: 'panadero', balance: 0 }])
    expect(searchClients(clients, 'plaza').map((client) => client.name)).toEqual(['Maria Lopez'])
    expect(searchClients(clients, '')).toBe(clients)
  })

  it('orders clients with debt first, then recent activity, then name', () => {
    const clients = [
      { name: 'Cero reciente', balance: 0, lastActivityAt: '2026-08-27T12:00:00Z' },
      { name: 'Deuda antigua', balance: 500, lastActivityAt: '2026-08-25T12:00:00Z' },
      { name: 'Deuda reciente', balance: 100, lastActivityAt: '2026-08-27T10:00:00Z' },
      { name: 'Alfa sin deuda', balance: 0, lastActivityAt: null },
    ]

    expect(sortClientsForHome(clients).map((client) => client.name)).toEqual([
      'Deuda reciente',
      'Deuda antigua',
      'Cero reciente',
      'Alfa sin deuda',
    ])
  })

  it('shows recent clients from economic activity only', () => {
    const clients = [
      { name: 'Sin movimientos', balance: 0, lastActivityAt: null },
      { name: 'Ayer', balance: 0, lastActivityAt: '2026-08-26T10:00:00Z' },
      { name: 'Hoy con deuda', balance: 1200, lastActivityAt: '2026-08-27T10:00:00Z' },
      { name: 'Hoy sin deuda', balance: 0, lastActivityAt: '2026-08-27T11:00:00Z' },
    ]

    expect(recentClients(clients, 2).map((client) => client.name)).toEqual(['Hoy con deuda', 'Hoy sin deuda'])
  })

  it('solo permite cobrar cuando queda deuda viva', () => {
    expect(canChargeClient(0)).toBe(false)
    expect(canChargeClient(1)).toBe(true)
    expect(canChargeClient(1840)).toBe(true)
  })

  it('no ofrece cobrar despues de un pago total', () => {
    const balance = calculateActiveBalance([{ amount_cents: 1840, status: 'active' }], [{ amount_cents: 1840, voided_at: null }])
    expect(balance).toBe(0)
    expect(canChargeClient(balance)).toBe(false)
    expect(canRegisterPayment(balance, 100)).toBe(false)
  })

  it('vuelve a permitir cobrar si se anula el pago que dejaba el saldo a cero', () => {
    const balance = calculateActiveBalance([{ amount_cents: 1840, status: 'active' }], [{ amount_cents: 1840, voided_at: '2026-08-27T12:00:00Z' }])
    expect(balance).toBe(1840)
    expect(canChargeClient(balance)).toBe(true)
  })

  it('suma el saldo anterior a la deuda como cualquier movimiento activo', () => {
    const sobreCero = calculateActiveBalance([{ amount_cents: 8640, status: 'active' }], [])
    expect(sobreCero).toBe(8640)

    const sobreDeudaExistente = calculateActiveBalance([
      { amount_cents: 1200, status: 'active' },
      { amount_cents: 8640, status: 'active' },
    ], [])
    expect(sobreDeudaExistente).toBe(9840)
  })

  it('descuenta el saldo anterior del total cuando se anula', () => {
    const trasAnular = calculateActiveBalance([
      { amount_cents: 1200, status: 'active' },
      { amount_cents: 8640, status: 'voided' },
    ], [])
    expect(trasAnular).toBe(1200)
    expect(canChargeClient(trasAnular)).toBe(true)
  })

  it('un pago sobre saldo anterior lo reduce igual que sobre una compra', () => {
    expect(calculateActiveBalance(
      [{ amount_cents: 8640, status: 'active' }],
      [{ amount_cents: 2000, voided_at: null }],
    )).toBe(6640)
  })

  it('confirma el saldo anterior nombrando importe y cliente', () => {
    const mensaje = openingBalanceConfirmation('Pedrito', 8640)
    expect(mensaje).toContain('86,40')
    expect(mensaje).toContain('Pedrito')
    expect(mensaje).toContain('ya debía anteriormente')
    expect(mensaje).not.toContain('importe alto')
  })

  it('reutiliza el aviso de importe alto en la misma confirmacion', () => {
    expect(openingBalanceConfirmation('Pedrito', 20000)).not.toContain('importe alto')
    expect(openingBalanceConfirmation('Pedrito', 20001)).toContain('importe alto')
  })

  it('requires confirmation only above the high ticket threshold', () => {
    expect(needsHighTicketConfirmation(20000)).toBe(false)
    expect(needsHighTicketConfirmation(20001)).toBe(true)
  })
})
