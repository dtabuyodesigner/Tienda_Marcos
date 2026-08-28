// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'

const { auth } = vi.hoisted(() => ({ auth: { signOut: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), updateUser: vi.fn(), resetPasswordForEmail: vi.fn() } }))
vi.mock('./lib/supabase', () => ({ supabase: { auth, rpc: vi.fn() } }))
vi.mock('./lib/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/data')>(),
  loadDashboard: vi.fn(async () => ({ clients: [], total: 0, tickets: [], payments: [], supportsOpeningBalance: true, supportsClientPhoto: true, photoUrls: {}, displayName: 'Marcos' })),
  loadClientHistory: vi.fn(),
  createClient: vi.fn(), createTicket: vi.fn(), createPayment: vi.fn(), createOpeningBalance: vi.fn(),
  attachClientPhoto: vi.fn(), removeClientPhoto: vi.fn(), updateClientEmail: vi.fn(),
  sendAccountSummaryEmail: vi.fn(), signedPhotoUrls: vi.fn(async () => ({})), attachTicketPhoto: vi.fn(),
  signedPhotoUrl: vi.fn(), voidMovement: vi.fn(),
}))

import { LockGate } from './App'
import { createPinRecord } from './lib/pin'
import { readLockConfig, writeLockConfig } from './lib/lock-storage'

const user = { id: 'u1', email: 'marcos@tienda.es' } as User

beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    const especificador = 'node:' + 'crypto'
    const { webcrypto } = (await import(/* @vite-ignore */ especificador)) as { webcrypto: Crypto }
    vi.stubGlobal('crypto', webcrypto)
  }
})

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('bloqueo con PIN', () => {
  it('sin PIN configurado la aplicacion se abre normal', async () => {
    render(<LockGate user={user} />)
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Introduce tu PIN' })).toBeNull()
  })

  it('con PIN guardado, al abrir o recargar pide el PIN y tapa los datos', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: null })
    render(<LockGate user={user} />)

    expect(await screen.findByRole('heading', { name: 'Introduce tu PIN' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull()
    expect(document.body.textContent).not.toContain('Pendiente de cobrar')
  })

  it('un PIN incorrecto no abre y avisa; el correcto desbloquea', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: null })
    render(<LockGate user={user} />)
    await screen.findByRole('heading', { name: 'Introduce tu PIN' })

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no es correcto')
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull()

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4917' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeTruthy()
  })

  it('el campo del PIN solo admite cifras', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: null })
    render(<LockGate user={user} />)
    const campo = await screen.findByLabelText('PIN') as HTMLInputElement

    fireEvent.change(campo, { target: { value: '12ab34' } })
    expect(campo.value).toBe('1234')
  })

  it('desde la pantalla de bloqueo se puede cerrar sesion', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: null })
    render(<LockGate user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('con actividad reciente y umbral amplio no bloquea al abrir', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 30, lastActiveAt: Date.now() })
    render(<LockGate user={user} />)

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeTruthy()
  })

  it('si volvio hace mas del umbral, bloquea', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: Date.now() - 6 * 60 * 1000 })
    render(<LockGate user={user} />)

    expect(await screen.findByRole('heading', { name: 'Introduce tu PIN' })).toBeTruthy()
  })

  it('con Nunca no bloquea aunque haga horas de la ultima actividad', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 0, lastActiveAt: Date.now() - 5 * 60 * 60 * 1000 })
    render(<LockGate user={user} />)

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeTruthy()
  })
})

describe('ajustes del PIN en Cuenta', () => {
  async function abrirCuenta() {
    render(<LockGate user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Marcos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))
    return screen.findByRole('heading', { name: 'Bloqueo con PIN' })
  }

  it('activa el PIN y NO guarda el PIN en claro en el dispositivo', async () => {
    await abrirCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Activar PIN' }))
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '4917' } })
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '4917' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))

    expect(await screen.findByText('✓ Bloqueo con PIN activado')).toBeTruthy()
    const guardado = readLockConfig()
    expect(guardado.pin).not.toBeNull()
    expect(JSON.stringify(guardado)).not.toContain('4917')
    expect(guardado.pin?.salt.length).toBeGreaterThan(0)
  })

  it('no acepta un PIN corto ni dos PIN distintos', async () => {
    await abrirCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Activar PIN' }))
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(readLockConfig().pin).toBeNull()

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4917' } })
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '4918' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no son iguales/i)
    expect(readLockConfig().pin).toBeNull()
  })

  it('permite quitar el PIN y elegir cuando se bloquea', async () => {
    writeLockConfig({ pin: await createPinRecord('4917'), minutes: 5, lastActiveAt: Date.now() })
    vi.stubGlobal('confirm', vi.fn(() => true))
    await abrirCuenta()

    expect(screen.getByRole('button', { name: 'Cambiar PIN' })).toBeTruthy()
    const selector = screen.getByLabelText(/Bloquear automáticamente/) as HTMLSelectElement
    fireEvent.change(selector, { target: { value: '15' } })
    await waitFor(() => expect(readLockConfig().minutes).toBe(15))

    fireEvent.click(screen.getByRole('button', { name: 'Quitar PIN' }))
    await waitFor(() => expect(readLockConfig().pin).toBeNull())
  })
})
