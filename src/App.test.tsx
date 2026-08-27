// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { Workspace } from './App'
import type { Client, ClientSummary } from './lib/data'
import { createClient, loadClientHistory, loadDashboard } from './lib/data'

const { auth } = vi.hoisted(() => ({
  auth: {
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}))

vi.mock('./lib/supabase', () => ({ supabase: { auth } }))
vi.mock('./lib/data', () => ({
  loadDashboard: vi.fn(),
  loadClientHistory: vi.fn(),
  createClient: vi.fn(),
  createTicket: vi.fn(),
  createPayment: vi.fn(),
  attachTicketPhoto: vi.fn(),
  signedPhotoUrl: vi.fn(),
  voidMovement: vi.fn(),
}))

const user = { id: 'user-1', email: 'marcos@covirantienda.es' } as User

function summary(name: string, balance: number, id = name.toLowerCase()): ClientSummary {
  return { id, store_id: 'store-1', name, phone: null, nickname: null, note: null, active: true, balance, lastActivityAt: '2026-08-27T10:00:00Z' }
}

function history(client: ClientSummary | Client, balance: number) {
  return { client: client as Client, tickets: [], payments: [], balance }
}

async function openFicha(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
  return screen.findByRole('heading', { name })
}

beforeEach(() => {
  vi.mocked(loadDashboard).mockResolvedValue({ clients: [summary('Ana', 1840), summary('Bruno', 0)], total: 1840 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ficha de cliente', () => {
  it('oculta Cobrar cuando el cliente no debe nada', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Bruno', 0), 0))
    render(<Workspace user={user} />)

    await openFicha('Bruno')

    expect(await screen.findByText('No debe nada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).toBeNull()
    expect(screen.getByRole('button', { name: '+ Nueva compra' })).toBeTruthy()
  })

  it('muestra Cobrar con el importe pendiente cuando hay deuda', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)

    await openFicha('Ana')

    const cobrar = await screen.findByRole('button', { name: /^Cobrar/ })
    expect(cobrar.textContent).toContain('18,40')
  })

  it('ofrece Ver historial como boton secundario, no como enlace', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)

    await openFicha('Ana')

    const historial = await screen.findByRole('button', { name: 'Ver historial' })
    expect(historial.tagName).toBe('BUTTON')
    expect(historial.className).toContain('secondary-action')
  })
})

describe('nuevo cliente desde la ficha', () => {
  it('crea el cliente y abre su ficha sin pasar por Inicio', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')

    fireEvent.click(await screen.findByRole('button', { name: '+ Nuevo cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByRole('heading', { name: 'Lucía' })).toBeTruthy()
    await waitFor(() => expect(createClient).toHaveBeenCalledWith(user, expect.objectContaining({ name: 'Lucía' })))
  })

  it('al cancelar vuelve a la ficha anterior', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    fireEvent.click(await screen.findByRole('button', { name: '+ Nuevo cliente' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo cliente' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Volver' }))

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeTruthy()
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('pantalla Cuenta', () => {
  async function openCuenta() {
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta' }))
    return screen.findByRole('heading', { name: 'Cuenta' })
  }

  it('no muestra el formulario de nueva contraseña al entrar', async () => {
    await openCuenta()

    expect(screen.getByText('marcos@covirantienda.es')).toBeTruthy()
    expect(screen.queryByLabelText(/Nueva contraseña/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy()
  })

  it('exige la contraseña actual antes de dejar cambiarla', async () => {
    await openCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByLabelText('Contraseña actual')).toBeTruthy()
    expect(screen.queryByLabelText(/Nueva contraseña/)).toBeNull()
  })

  it('no abre el cambio si la reautenticacion falla', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('invalid') })
    await openCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: 'equivocada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'La contraseña actual no es correcta.')
    expect(screen.queryByLabelText(/Nueva contraseña/)).toBeNull()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('tras reautenticar pide la nueva contraseña dos veces y solo confirma con exito real', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    auth.updateUser.mockResolvedValue({ error: null })
    await openCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: 'correcta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const nueva = await screen.findByLabelText('Nueva contraseña')
    const repetida = screen.getByLabelText('Repetir nueva contraseña')
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'marcos@covirantienda.es', password: 'correcta1' })

    fireEvent.change(nueva, { target: { value: 'libreta2026' } })
    fireEvent.change(repetida, { target: { value: 'libreta2027' } })
    fireEvent.submit(nueva.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Las contraseñas no coinciden.')
    expect(auth.updateUser).not.toHaveBeenCalled()

    fireEvent.change(repetida, { target: { value: 'libreta2026' } })
    fireEvent.submit(nueva.closest('form')!)

    expect(await screen.findByText('✓ Contraseña actualizada')).toBeTruthy()
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'libreta2026' })
    expect(screen.queryByLabelText(/Nueva contraseña/)).toBeNull()
  })

  it('no anuncia exito si Supabase rechaza el cambio', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    auth.updateUser.mockResolvedValue({ error: new Error('weak password') })
    await openCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: 'correcta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const nueva = await screen.findByLabelText('Nueva contraseña')
    fireEvent.change(nueva, { target: { value: 'libreta2026' } })
    fireEvent.change(screen.getByLabelText('Repetir nueva contraseña'), { target: { value: 'libreta2026' } })
    fireEvent.submit(nueva.closest('form')!)

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'No se pudo cambiar la contraseña. Vuelve a intentarlo.')
    expect(screen.queryByText('✓ Contraseña actualizada')).toBeNull()
  })

  it('ofrece el flujo de recuperacion de Supabase si no recuerda la contraseña', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    await openCuenta()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.click(await screen.findByRole('button', { name: 'He olvidado mi contraseña' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar enlace' }))

    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('marcos@covirantienda.es', expect.objectContaining({ redirectTo: expect.any(String) })))
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})
