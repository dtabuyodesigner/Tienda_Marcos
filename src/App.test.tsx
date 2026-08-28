// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { Login, SUCCESS_NOTICE_MS, Workspace } from './App'
import type { Client, ClientSummary } from './lib/data'
import { attachClientPhoto, createClient, createOpeningBalance, createPayment, loadClientHistory, loadDashboard, removeClientPhoto, sendAccountSummaryEmail, updateClientEmail } from './lib/data'
import type { Payment, Ticket } from './lib/data'

const { auth, rpc } = vi.hoisted(() => ({
  auth: {
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  rpc: vi.fn(),
}))

vi.mock('./lib/supabase', () => ({ supabase: { auth, rpc } }))
vi.mock('./lib/account-pdf', () => ({
  accountPdfFileName: () => 'cuenta-ana-2026-08-27.pdf',
  generateAccountPdf: vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' })),
}))
vi.mock('./lib/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/data')>(),
  loadDashboard: vi.fn(),
  loadClientHistory: vi.fn(),
  createClient: vi.fn(),
  createTicket: vi.fn(),
  createPayment: vi.fn(),
  createOpeningBalance: vi.fn(),
  attachClientPhoto: vi.fn(),
  removeClientPhoto: vi.fn(),
  updateClientEmail: vi.fn(),
  sendAccountSummaryEmail: vi.fn(),
  signedPhotoUrls: vi.fn(async () => ({})),
  attachTicketPhoto: vi.fn(),
  signedPhotoUrl: vi.fn(),
  voidMovement: vi.fn(),
}))

const user = { id: 'user-1', email: 'marcos@covirantienda.es' } as User

function summary(name: string, balance: number, id = name.toLowerCase(), photoPath: string | null = null): ClientSummary {
  return { id, store_id: 'store-1', name, phone: null, nickname: null, note: null, photo_path: photoPath, active: true, balance, lastActivityAt: '2026-08-27T10:00:00Z' }
}

function dashboard(overrides: Partial<{ clients: ClientSummary[]; total: number; tickets: Ticket[]; payments: Payment[]; supportsOpeningBalance: boolean; supportsClientPhoto: boolean; photoUrls: Record<string, string>; displayName: string | null }> = {}) {
  return { clients: [], total: 0, tickets: [], payments: [], supportsOpeningBalance: true, supportsClientPhoto: true, photoUrls: {}, displayName: 'Marcos', ...overrides }
}

function history(client: ClientSummary | Client, balance: number, tickets: Ticket[] = []) {
  return { client: client as Client, tickets, payments: [], balance }
}

function ticket(values: Partial<Ticket> & Pick<Ticket, 'id' | 'amount_cents'>): Ticket {
  return {
    store_id: 'store-1',
    client_id: 'ana',
    concept: null,
    photo_path: null,
    status: 'active',
    origin: 'purchase',
    created_by: 'user-1',
    created_at: '2026-08-27T10:00:00Z',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...values,
  }
}

async function openFicha(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
  return screen.findByRole('heading', { name })
}

beforeEach(() => {
  vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 1840), summary('Bruno', 0)], total: 1840 }))
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

    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
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

    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo cliente' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Volver' }))

    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeTruthy()
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('pantalla Cuenta', () => {
  async function openCuenta() {
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Marcos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))
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

describe('saldo anterior desde la ficha', () => {
  function pedrito(balance: number, tickets: Ticket[] = []) {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', balance), balance, tickets))
  }

  async function abrirFormulario() {
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir saldo anterior' }))
    return screen.findByLabelText(/Importe que ya debía/)
  }

  it('ofrece la accion sin competir con las acciones principales', async () => {
    pedrito(0)
    render(<Workspace user={user} />)
    await openFicha('Ana')

    const accion = await screen.findByRole('button', { name: 'Añadir saldo anterior' })
    expect(accion.className).toContain('subtle-action')
    expect(screen.getByRole('button', { name: '+ Nueva compra' }).className).toContain('primary-action')
  })

  it('no ofrece la accion si el esquema todavia no soporta el origen', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 0)], supportsOpeningBalance: false }))
    pedrito(0)
    render(<Workspace user={user} />)
    await openFicha('Ana')

    await screen.findByRole('button', { name: 'Ver historial' })
    expect(screen.queryByRole('button', { name: 'Añadir saldo anterior' })).toBeNull()
  })

  it('no ofrece la accion si el cliente ya tiene un saldo anterior vivo', async () => {
    pedrito(8640, [ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' })])
    render(<Workspace user={user} />)
    await openFicha('Ana')

    await screen.findByRole('button', { name: 'Ver historial' })
    expect(screen.queryByRole('button', { name: 'Añadir saldo anterior' })).toBeNull()
  })

  it('explica para que sirve antes de pedir el importe', async () => {
    pedrito(0)
    await abrirFormulario()

    expect(screen.getByText('Para apuntar lo que este cliente ya debía antes de empezar a usar La Libreta.')).toBeTruthy()
  })

  it('pide confirmacion con el importe y guarda el saldo anterior sobre saldo cero', async () => {
    pedrito(0)
    const confirm = vi.fn((_message?: string) => true)
    vi.stubGlobal('confirm', confirm)
    vi.mocked(createOpeningBalance).mockResolvedValue(ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' }))
    const importe = await abrirFormulario()

    fireEvent.change(importe, { target: { value: '86,40' } })
    fireEvent.change(screen.getByLabelText(/Nota/), { target: { value: 'Tickets de papel' } })
    pedrito(8640, [ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' })])
    fireEvent.click(screen.getByRole('button', { name: 'Añadir saldo anterior' }))

    await waitFor(() => expect(createOpeningBalance).toHaveBeenCalledWith(user, 'ana', 8640, 'Tickets de papel'))
    expect(confirm.mock.calls[0][0]).toContain('86,40')
    expect(confirm.mock.calls[0][0]).toContain('ya debía anteriormente')
    expect(await screen.findByText('✓ Saldo anterior añadido')).toBeTruthy()
    expect(await screen.findByText(/Ahora Ana debe .*86,40/)).toBeTruthy()
  })

  it('suma sobre una deuda ya existente en lugar de sustituirla', async () => {
    pedrito(1200, [ticket({ id: 't-1', amount_cents: 1200 })])
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(createOpeningBalance).mockResolvedValue(ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' }))
    const importe = await abrirFormulario()

    fireEvent.change(importe, { target: { value: '86,40' } })
    pedrito(9840, [ticket({ id: 't-1', amount_cents: 1200 }), ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' })])
    fireEvent.click(screen.getByRole('button', { name: 'Añadir saldo anterior' }))

    expect(await screen.findByText(/Ahora Ana debe .*98,40/)).toBeTruthy()
  })

  it('no guarda nada si se cancela la confirmacion', async () => {
    pedrito(0)
    vi.stubGlobal('confirm', vi.fn(() => false))
    const importe = await abrirFormulario()

    fireEvent.change(importe, { target: { value: '86,40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir saldo anterior' }))

    await waitFor(() => expect(createOpeningBalance).not.toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: 'Añadir saldo anterior' })).toBeTruthy()
  })

  it('rechaza importe cero y negativo sin llegar a la base de datos', async () => {
    pedrito(0)
    vi.stubGlobal('confirm', vi.fn(() => true))
    const importe = await abrirFormulario()

    for (const invalido of ['0', '-5', '0,00', 'abc']) {
      fireEvent.change(importe, { target: { value: invalido } })
      fireEvent.click(screen.getByRole('button', { name: 'Añadir saldo anterior' }))
      expect((await screen.findByRole('alert')).textContent).toContain('importe válido')
    }
    expect(createOpeningBalance).not.toHaveBeenCalled()
  })

  it('protege frente a doble submit', async () => {
    pedrito(0)
    vi.stubGlobal('confirm', vi.fn(() => true))
    let resolver: (value: Ticket) => void = () => {}
    vi.mocked(createOpeningBalance).mockReturnValue(new Promise<Ticket>((resolve) => { resolver = resolve }))
    const importe = await abrirFormulario()

    fireEvent.change(importe, { target: { value: '86,40' } })
    const boton = screen.getByRole('button', { name: 'Añadir saldo anterior' })
    fireEvent.click(boton)
    fireEvent.click(boton)
    fireEvent.click(boton)

    expect(createOpeningBalance).toHaveBeenCalledTimes(1)
    resolver(ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance' }))
  })

  it('avisa si la base de datos rechaza un segundo saldo anterior', async () => {
    pedrito(0)
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(createOpeningBalance).mockRejectedValue({ code: '23505' })
    const importe = await abrirFormulario()

    fireEvent.change(importe, { target: { value: '86,40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir saldo anterior' }))

    expect((await screen.findByRole('alert')).textContent).toContain('ya tiene un saldo anterior registrado')
  })
})

describe('historial con saldo anterior', () => {
  it('distingue Saldo anterior de Compra y refleja la anulacion', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1200), 1200, [
      ticket({ id: 't-1', amount_cents: 1200, concept: 'Pan y leche' }),
      ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance', status: 'voided', voided_at: '2026-08-27T12:00:00Z', void_reason: 'Importe equivocado' }),
    ]))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))

    const anterior = await screen.findByText('Saldo anterior')
    const fila = anterior.closest('button')!
    expect(fila.textContent).toContain('Registrado el')
    expect(fila.textContent).toContain('Anulado')
    expect(fila.textContent).not.toContain('Compra')

    const compra = screen.getByText(/^Compra · Activo/)
    expect(compra.closest('button')!.textContent).toContain('Pan y leche')
  })

  it('el saldo anterior anulado no cuenta en la deuda de la ficha', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1200), 1200, [
      ticket({ id: 't-1', amount_cents: 1200 }),
      ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance', status: 'voided', voided_at: '2026-08-27T12:00:00Z', void_reason: 'Importe equivocado' }),
    ]))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    expect((await screen.findByRole('button', { name: /^Cobrar/ })).textContent).toContain('12,00')
    expect(screen.getByRole('button', { name: 'Añadir saldo anterior' })).toBeTruthy()
  })
})

describe('control de usuario de la cabecera', () => {
  async function abrirMenu() {
    render(<Workspace user={user} />)
    const trigger = await screen.findByRole('button', { name: 'Marcos' })
    fireEvent.click(trigger)
    return trigger
  }

  it('sustituye los enlaces sueltos por un unico control con el nombre del perfil', async () => {
    render(<Workspace user={user} />)

    const trigger = await screen.findByRole('button', { name: 'Marcos' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Salir' })).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('cae al usuario del email si el perfil no tiene display_name', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ displayName: null }))
    render(<Workspace user={user} />)

    expect(await screen.findByRole('button', { name: 'marcos' })).toBeTruthy()
  })

  it('abre y cierra el menu desde el propio control', async () => {
    const trigger = await abrirMenu()

    expect(await screen.findByRole('menu')).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Cuenta' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeTruthy()

    fireEvent.click(trigger)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('ofrece Resumen, Cuenta y Ayuda antes de Cerrar sesión', async () => {
    await abrirMenu()

    await screen.findByRole('menu')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Resumen', 'Cuenta', 'Ayuda', 'Cerrar sesión'])
  })

  it('abre la Ayuda desde el menu y se puede volver', async () => {
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ayuda' }))

    expect(await screen.findByRole('heading', { name: 'Ayuda' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByText(/Pedrito me paga solo 20/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '← Volver' }))
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeTruthy()
  })

  it('Cuenta y Cerrar sesión siguen funcionando con Ayuda en medio', async () => {
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))
    expect(await screen.findByRole('heading', { name: 'Cuenta' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Marcos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('lleva a Cuenta y cierra el menu al elegir', async () => {
    await abrirMenu()

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))

    expect(await screen.findByRole('heading', { name: 'Cuenta' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('cierra sesion con el logout existente y cierra el menu', async () => {
    await abrirMenu()

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }))

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('cierra al pulsar fuera', async () => {
    await abrirMenu()
    await screen.findByRole('menu')

    fireEvent.mouseDown(document.body)

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('cierra con Escape y devuelve el foco al control', async () => {
    const trigger = await abrirMenu()
    await screen.findByRole('menu')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('es navegable por teclado dentro del menu', async () => {
    await abrirMenu()
    const menu = await screen.findByRole('menu')
    const [resumen, cuenta, , salir] = screen.getAllByRole('menuitem')

    expect(document.activeElement).toBe(resumen)
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cuenta)
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(resumen)
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(salir)
  })
})

describe('identidad del cliente en sus pantallas', () => {
  async function abrir(nombreBoton: string, balance: number, tickets: Ticket[] = []) {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', balance), balance, tickets))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: nombreBoton }))
  }

  it('Historial identifica al cliente y muestra su deuda actual', async () => {
    await abrir('Ver historial', 1840, [ticket({ id: 't-1', amount_cents: 1840 })])

    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(await screen.findByText(/Deuda actual: .*18,40/)).toBeTruthy()
  })

  it('Historial dice No debe nada cuando el saldo es cero', async () => {
    await abrir('Ver historial', 0)

    await screen.findByRole('heading', { name: 'Historial' })
    expect(await screen.findByText('No debe nada')).toBeTruthy()
    expect(screen.queryByText(/Deuda actual/)).toBeNull()
  })

  it('Ver cuenta muestra el nombre del cliente de forma visible', async () => {
    await abrir('Ver cuenta', 1840, [ticket({ id: 't-1', amount_cents: 1840 })])

    await screen.findByRole('heading', { name: 'Ver cuenta' })
    const nombre = await screen.findByText('Ana')
    expect(nombre.className).toContain('client-identity-name')
  })

  it('el nombre viene del cliente seleccionado, no de estado propio', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 1840), summary('Bruno', 500)], total: 2340 }))
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Bruno', 500), 500))
    render(<Workspace user={user} />)
    await openFicha('Bruno')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))

    await screen.findByRole('heading', { name: 'Historial' })
    expect(screen.getByText('Bruno')).toBeTruthy()
    expect(screen.queryByText('Ana')).toBeNull()
  })
})

describe('crear otro cliente desde la ficha', () => {
  it('vive en la cabecera de la ficha, junto al nombre, y no entre las acciones del cliente', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    const crear = await screen.findByRole('button', { name: '+ Crear otro cliente' })
    expect(screen.queryByRole('button', { name: '+ Nuevo cliente' })).toBeNull()
    expect(crear.closest('.secondary-actions')).toBeNull()
    expect(crear.closest('.page-heading')).not.toBeNull()
    expect(crear.closest('.page-heading')?.querySelector('h1')?.textContent).toBe('Ana')
    expect(crear.className).toContain('subtle-action')
    expect(crear.className).not.toContain('primary-action')
  })

  it('confirma el alta y permite crear otro sin volver a Inicio', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')

    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('✓ Lucía creado correctamente')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Lucía' })).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo cliente' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull()
  })
})

describe('los avisos de exito son efimeros', () => {
  async function crearLucia() {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(await screen.findByText('✓ Lucía creado correctamente')).toBeTruthy()
  }

  it('el aviso de alta no sobrevive a la navegacion ni reaparece despues', async () => {
    await crearLucia()

    fireEvent.click(screen.getByRole('button', { name: '← Volver' }))
    await screen.findByRole('heading', { name: 'Clientes' })
    expect(screen.queryByText('✓ Lucía creado correctamente')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }))
    await screen.findByRole('heading', { name: 'Ana' })
    expect(screen.queryByText('✓ Lucía creado correctamente')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))
    await screen.findByRole('heading', { name: 'Historial' })
    expect(screen.queryByText('✓ Lucía creado correctamente')).toBeNull()
  })

  it('el aviso de alta desaparece solo tras unos segundos sin tocar nada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await crearLucia()

      // Con temporizadores falsos React no vacia los efectos pasivos hasta que se
      // cede el turno: primero se deja instalar el efecto y despues se avanza el reloj.
      await act(async () => {})
      expect(vi.getTimerCount()).toBe(1)
      await act(async () => { vi.advanceTimersByTime(SUCCESS_NOTICE_MS + 100) })

      await waitFor(() => expect(screen.queryByText('✓ Lucía creado correctamente')).toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })

  it('la confirmacion de cobro tampoco se arrastra al cambiar de pantalla', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createPayment).mockResolvedValue({ id: 'p-1', store_id: 'store-1', client_id: 'ana', amount_cents: 1840, created_by: 'user-1', created_at: '2026-08-27T10:00:00Z', voided_at: null, voided_by: null, void_reason: null })
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar/ }))
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 0), 0))
    fireEvent.click(await screen.findByRole('button', { name: 'Paga todo' }))

    expect(await screen.findByText(/ya no debe nada/)).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))
    await screen.findByRole('heading', { name: 'Historial' })
    expect(screen.queryByText(/ya no debe nada/)).toBeNull()
  })

  it('un error activo no se borra al navegar ni caduca solo', async () => {
    vi.mocked(loadDashboard).mockRejectedValueOnce(new Error('sin conexion'))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<Workspace user={user} />)
      const error = await screen.findByRole('alert')
      expect(error.textContent).toContain('No se pudieron cargar los datos')

      await act(async () => { vi.advanceTimersByTime(SUCCESS_NOTICE_MS + 100) })
      expect(screen.getByRole('alert')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'marcos' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))
      await screen.findByRole('heading', { name: 'Cuenta' })
      expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los datos')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('foto del cliente', () => {
  const FOTO = 'https://signed.example/ana.jpg?token=abc'
  const archivo = () => new File(['x'], 'ana.jpg', { type: 'image/jpeg' })

  it('sin foto se usa la inicial y no hay imagen rota', async () => {
    render(<Workspace user={user} />)

    const fila = await screen.findByRole('button', { name: /Ana/ })
    expect(fila.querySelector('img')).toBeNull()
    expect(fila.querySelector('.avatar')?.textContent).toBe('A')
  })

  it('con foto se muestra la imagen del cliente', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 1840, 'ana', 'store-1/client-photos/ana/1.jpg')], total: 1840, photoUrls: { ana: FOTO } }))
    render(<Workspace user={user} />)

    const fila = await screen.findByRole('button', { name: /Ana/ })
    const img = fila.querySelector('img')
    expect(img?.getAttribute('src')).toBe(FOTO)
    expect(img?.className).toContain('avatar-photo')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('si la imagen no carga vuelve a la inicial en vez de dejar un hueco', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 1840, 'ana', 'p.jpg')], total: 1840, photoUrls: { ana: FOTO } }))
    render(<Workspace user={user} />)
    const fila = await screen.findByRole('button', { name: /Ana/ })

    fireEvent.error(fila.querySelector('img')!)

    await waitFor(() => expect(fila.querySelector('img')).toBeNull())
    expect(fila.querySelector('.avatar')?.textContent).toBe('A')
  })

  it('crear cliente sin foto no toca Storage', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('✓ Lucía creado correctamente')).toBeTruthy()
    expect(attachClientPhoto).not.toHaveBeenCalled()
  })

  it('si falla la foto el cliente no se duplica y se avisa para reintentar', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    const lucia = { id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, active: true }
    vi.mocked(createClient).mockResolvedValue(lucia)
    vi.mocked(attachClientPhoto).mockRejectedValue(new Error('storage caido'))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    fireEvent.change(screen.getByLabelText('Hacer o elegir foto'), { target: { files: [archivo()] } })
    vi.mocked(loadClientHistory).mockResolvedValue(history(lucia as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('Lucía creado, pero la foto no se guardó')).toBeTruthy()
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Lucía' })).toBeTruthy()
    expect(await screen.findByLabelText('Añadir foto')).toBeTruthy()
  })

  it('permite añadir la foto desde la ficha', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(attachClientPhoto).mockResolvedValue({ ...summary('Ana', 1840), photo_path: 'store-1/client-photos/ana/1.jpg' })
    render(<Workspace user={user} />)
    await openFicha('Ana')

    fireEvent.change(await screen.findByLabelText('Añadir foto'), { target: { files: [archivo()] } })

    await waitFor(() => expect(attachClientPhoto).toHaveBeenCalledWith(user, expect.objectContaining({ id: 'ana' }), expect.any(File)))
  })

  it('permite cambiar y quitar la foto sin borrar al cliente', async () => {
    const conFoto = summary('Ana', 1840, 'ana', 'store-1/client-photos/ana/1.jpg')
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [conFoto], total: 1840, photoUrls: { ana: FOTO } }))
    vi.mocked(loadClientHistory).mockResolvedValue(history(conFoto, 1840))
    vi.mocked(removeClientPhoto).mockResolvedValue({ ...conFoto, photo_path: null })
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    expect(await screen.findByLabelText('Cambiar foto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }))

    await waitFor(() => expect(removeClientPhoto).toHaveBeenCalledWith(user, expect.objectContaining({ id: 'ana' })))
    expect(screen.getByRole('heading', { name: 'Ana' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Cobrar/ })).toBeTruthy()
  })

  it('no ofrece foto si el esquema todavia no la soporta', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 1840)], total: 1840, supportsClientPhoto: false }))
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    await screen.findByRole('button', { name: 'Ver historial' })
    expect(screen.queryByLabelText('Añadir foto')).toBeNull()
  })
})

describe('resumen de la ficha', () => {
  it('muestra cifras derivadas de los movimientos reales', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1200), 1200, [
      ticket({ id: 'ob-1', amount_cents: 8640, origin: 'opening_balance', created_at: '2026-08-01T10:00:00Z' }),
      ticket({ id: 't-1', amount_cents: 1200, created_at: '2026-08-20T10:00:00Z' }),
      ticket({ id: 't-2', amount_cents: 500, status: 'voided', voided_at: '2026-08-21T10:00:00Z', created_at: '2026-08-21T09:00:00Z' }),
    ]))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    const resumen = (await screen.findByRole('heading', { name: 'Resumen' })).closest('section')!
    expect(resumen.textContent).toContain('Movimientos de deuda activos')
    // 2 activos: saldo anterior + compra. El anulado no cuenta.
    expect(resumen.querySelector('dl')?.textContent).toContain('2')
    // Total apuntado activo = 8640 + 1200, sin el ticket anulado.
    expect(resumen.textContent).toContain('98,40')
    expect(resumen.textContent).toContain('Todavía no hay pagos')
    expect(resumen.textContent).toContain('Movimientos registrados')
    expect(resumen.textContent).toContain('no cuentan movimientos anulados')
  })

  it('no repite la deuda actual que ya se muestra en grande', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1200), 1200, [ticket({ id: 't-1', amount_cents: 1200 })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    const resumen = (await screen.findByRole('heading', { name: 'Resumen' })).closest('section')!
    expect(resumen.textContent).not.toContain('Deuda actual')
  })
})

describe('alta de cuenta con invitacion', () => {
  async function abrirAlta() {
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }))
    return screen.findByRole('heading', { name: 'Crear mi cuenta' })
  }

  async function rellenar(codigo = 'ABCD1234EF56') {
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Marcos' } })
    fireEvent.change(screen.getByLabelText('Nombre de la tienda'), { target: { value: 'Covirán San Miguel' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'marcos@tienda.es' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'libreta2026' } })
    fireEvent.change(screen.getByLabelText('Repetir contraseña'), { target: { value: 'libreta2026' } })
    fireEvent.change(screen.getByLabelText('Código de invitación'), { target: { value: codigo } })
  }

  function enviar() {
    fireEvent.submit(screen.getByLabelText('Tu nombre').closest('form')!)
  }

  it('la pantalla de acceso ofrece crear cuenta sin perder login ni recuperacion', () => {
    render(<Login />)

    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '¿Has olvidado tu contraseña?' })).toBeTruthy()
  })

  it('el formulario pide invitacion y no trae ningun codigo dentro', async () => {
    await abrirAlta()

    const codigo = screen.getByLabelText('Código de invitación') as HTMLInputElement
    expect(codigo.value).toBe('')
    expect(screen.getByText(/necesitas un código de invitación/i)).toBeTruthy()
  })

  it('no envia nada si las contraseñas no coinciden', async () => {
    await abrirAlta()
    await rellenar()
    fireEvent.change(screen.getByLabelText('Repetir contraseña'), { target: { value: 'otra2026' } })
    enviar()

    expect((await screen.findByRole('alert')).textContent).toContain('no coinciden')
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('no envia nada sin codigo de invitacion', async () => {
    await abrirAlta()
    await rellenar('')
    enviar()

    expect((await screen.findByRole('alert')).textContent).toContain('código de invitación')
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('rechaza un codigo que la base de datos dice que no vale', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await abrirAlta()
    await rellenar()
    enviar()

    expect((await screen.findByRole('alert')).textContent).toContain('no es válido o ya se ha usado')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('invite_is_available', { code: 'ABCD1234EF56' }))
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('crea la cuenta enviando nombre, tienda y codigo como metadatos', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: { access_token: 't' } }, error: null })
    await abrirAlta()
    await rellenar()
    enviar()

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1))
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'marcos@tienda.es',
      options: expect.objectContaining({ data: { display_name: 'Marcos', store_name: 'Covirán San Miguel', invite_code: 'ABCD1234EF56' } }),
    }))
  })

  it('si Auth exige confirmar el email lo dice en vez de fingir que ya entra', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null }, error: null })
    await abrirAlta()
    await rellenar()
    enviar()

    expect(await screen.findByRole('heading', { name: '✓ Cuenta creada' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('confirmar tu email')
  })

  it('avisa si el email ya tiene cuenta', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [] }, session: null }, error: null })
    await abrirAlta()
    await rellenar()
    enviar()

    expect((await screen.findByRole('alert')).textContent).toContain('ya tiene cuenta')
  })

  it('traduce el fallo del alta en base de datos apuntando al codigo ya usado', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Database error saving new user' } })
    await abrirAlta()
    await rellenar()
    enviar()

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toContain('código de invitación')
    expect(aviso.textContent).not.toContain('Database error')
  })

  it('sigue adelante si la comprobacion previa del codigo falla: decide la base de datos', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: { access_token: 't' } }, error: null })
    await abrirAlta()
    await rellenar()
    enviar()

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1))
  })

  it('protege frente a doble submit', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    auth.signUp.mockReturnValue(new Promise(() => {}))
    await abrirAlta()
    await rellenar()
    enviar()
    enviar()
    enviar()

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1))
  })
})

describe('ayudas contextuales', () => {
  it('explica que la foto del ticket es opcional al apuntar una compra', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Nueva compra' }))

    expect(await screen.findByText(/Opcional. Sirve por si luego hay dudas/)).toBeTruthy()
  })

  it('explica que anular no borra al abrir un movimiento', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840, [ticket({ id: 't-1', amount_cents: 1840 })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: /Compra/ }))

    expect(await screen.findByText(/Anular no borra el movimiento/)).toBeTruthy()
  })

  it('mantiene la explicacion del saldo anterior y la de la contraseña', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 0), 0))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir saldo anterior' }))
    expect(await screen.findByText(/ya debía antes de empezar a usar La Libreta/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '← Volver' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marcos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cuenta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }))
    expect(await screen.findByText(/confirma tu contraseña actual/)).toBeTruthy()
  })
})

describe('avisos de cuentas pendientes por antiguedad', () => {
  // Reloj congelado: la antiguedad se mide en dias naturales, asi que una pasada
  // que cruce la medianoche convertiria un "8 dias" en 9 y el test parpadearia.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-27T10:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  function diasAtras(dias: number): string {
    return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  }
  function conDeuda(dias: number, extra: Partial<Ticket> = {}) {
    const t = ticket({ id: 'viejo', amount_cents: 7900, created_at: diasAtras(dias), ...extra })
    return dashboard({ clients: [summary('Margarita', 7900, 'ana')], total: 7900, tickets: [t], payments: [] })
  }

  it('a los 6 dias todavia no avisa', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(6))
    render(<Workspace user={user} />)

    await screen.findByRole('button', { name: /Margarita/ })
    expect(screen.queryByText(/llevan? más de 7 días/)).toBeNull()
  })

  it('a los 7 dias tampoco: la regla es mas de 7', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(7))
    render(<Workspace user={user} />)

    await screen.findByRole('button', { name: /Margarita/ })
    expect(screen.queryByText(/llevan? más de 7 días/)).toBeNull()
  })

  it('a los 8 dias avisa con nombre, saldo y antiguedad', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(8))
    render(<Workspace user={user} />)

    const aviso = await screen.findByLabelText('Cuentas pendientes desde hace tiempo')
    expect(within(aviso).getByRole('heading').textContent).toContain('Una cuenta lleva más de 7 días pendientes')
    const fila = within(aviso).getByRole('button', { name: /Margarita/ })
    expect(fila.textContent).toContain('79,00')
    expect(fila.textContent).toContain('8 días')
    expect(fila.textContent).not.toContain('al menos')
  })

  it('con saldo anterior dice al menos, sin fingir precision', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(12, { origin: 'opening_balance' }))
    render(<Workspace user={user} />)

    const aviso = await screen.findByLabelText('Cuentas pendientes desde hace tiempo')
    expect(within(aviso).getByRole('button', { name: /Margarita/ }).textContent).toContain('al menos 12 días')
  })

  it('una compra reciente no rejuvenece la deuda antigua', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({
      clients: [summary('Margarita', 3000, 'ana')],
      total: 3000,
      tickets: [ticket({ id: 'julio', amount_cents: 2000, created_at: diasAtras(31) }), ticket({ id: 'hoy', amount_cents: 1000, created_at: diasAtras(0) })],
      payments: [],
    }))
    render(<Workspace user={user} />)

    const aviso = await screen.findByLabelText('Cuentas pendientes desde hace tiempo')
    expect(within(aviso).getByRole('button', { name: /Margarita/ }).textContent).toContain('31 días')
  })

  it('sin cuentas antiguas no aparece ningun bloque vacio', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(2))
    render(<Workspace user={user} />)

    await screen.findByRole('button', { name: /Margarita/ })
    expect(screen.queryByLabelText('Cuentas pendientes desde hace tiempo')).toBeNull()
  })

  it('un cliente sin saldo nunca sale en el aviso', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({
      clients: [summary('Margarita', 0, 'ana')],
      tickets: [ticket({ id: 't', amount_cents: 2000, created_at: diasAtras(40) })],
      payments: [{ id: 'p', store_id: 'store-1', client_id: 'ana', amount_cents: 2000, created_by: 'u', created_at: diasAtras(1), voided_at: null, voided_by: null, void_reason: null }],
    }))
    render(<Workspace user={user} />)

    await screen.findByRole('button', { name: /Margarita/ })
    expect(screen.queryByLabelText('Cuentas pendientes desde hace tiempo')).toBeNull()
  })

  it('la ficha marca la antiguedad sin etiquetar al cliente', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conDeuda(12))
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Margarita', 7900, 'ana'), 7900, [ticket({ id: 'viejo', amount_cents: 7900, created_at: diasAtras(12) })]))
    render(<Workspace user={user} />)
    const aviso = await screen.findByLabelText('Cuentas pendientes desde hace tiempo')
    fireEvent.click(within(aviso).getByRole('button', { name: /Margarita/ }))

    expect(await screen.findByText('Pendiente desde hace 12 días')).toBeTruthy()
    const pantalla = document.body.textContent ?? ''
    for (const etiqueta of ['moroso', 'mal pagador', 'riesgo', 'problemático']) {
      expect(pantalla.toLowerCase()).not.toContain(etiqueta)
    }
  })
})

describe('resumen global de la tienda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-27T10:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('se abre desde el menu y muestra cifras y cuentas antiguas', async () => {
    const viejo = ticket({ id: 'v', amount_cents: 7900, created_at: new Date(Date.now() - 12 * 86400000).toISOString() })
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Margarita', 7900, 'ana')], total: 7900, tickets: [viejo], payments: [] }))
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Marcos' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Resumen' }))

    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeTruthy()
    expect(screen.getByText('Pendiente total')).toBeTruthy()
    expect(screen.getByText('Clientes con deuda')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Este mes' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cuentas más antiguas' })).toBeTruthy()
    expect(screen.getAllByText(/79,00/).length).toBeGreaterThan(0)
  })
})

describe('email opcional del cliente', () => {
  it('el alta acepta cliente sin email', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, email: null, active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(createClient).toHaveBeenCalledWith(user, expect.objectContaining({ email: null })))
  })

  it('el alta normaliza el email y rechaza uno invalido', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(createClient).mockResolvedValue({ id: 'lucia', store_id: 'store-1', name: 'Lucía', phone: null, nickname: null, note: null, email: 'lucia@correo.es', active: true })
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear otro cliente' }))
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: 'Lucía' } })

    // `type="email"` ya frena lo evidente en el navegador. Se prueba el caso que
    // el navegador acepta y nuestra regla no: dominio sin punto.
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'lucia@correo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect((await screen.findByRole('alert')).textContent).toContain('email')
    expect(createClient).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: '  Lucia@Correo.ES  ' } })
    vi.mocked(loadClientHistory).mockResolvedValue(history({ id: 'lucia', name: 'Lucía' } as Client, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(createClient).toHaveBeenCalledWith(user, expect.objectContaining({ email: 'lucia@correo.es' })))
  })

  it('permite anadir y cambiar el email desde la ficha', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    vi.mocked(updateClientEmail).mockResolvedValue({ ...summary('Ana', 1840), email: 'ana@correo.es' })
    render(<Workspace user={user} />)
    await openFicha('Ana')

    fireEvent.click(await screen.findByRole('button', { name: 'Añadir email' }))
    fireEvent.change(screen.getByLabelText(/Email del cliente/), { target: { value: 'ana@correo.es' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar email' }))

    await waitFor(() => expect(updateClientEmail).toHaveBeenCalledWith(user, expect.objectContaining({ id: 'ana' }), 'ana@correo.es'))
  })

  it('no rompe la ficha de un cliente que nunca tuvo email', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    expect(await screen.findByRole('button', { name: 'Añadir email' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeTruthy()
  })
})

describe('compartir la cuenta del cliente', () => {
  const conEmail = () => ({ ...summary('Ana', 1840, 'ana'), email: 'ana@correo.es', phone: '600 11 22 33' })

  async function abrirVerCuenta(cliente: ClientSummary) {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [cliente], total: cliente.balance }))
    vi.mocked(loadClientHistory).mockResolvedValue(history(cliente, cliente.balance, [ticket({ id: 't1', amount_cents: 1840, created_at: '2026-08-20T10:00:00Z' })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver cuenta' }))
    await screen.findByRole('heading', { name: 'Ver cuenta' })
  }

  async function abrirMenuCompartir(cliente: ClientSummary = conEmail() as ClientSummary) {
    await abrirVerCuenta(cliente as ClientSummary)
    const trigger = await screen.findByRole('button', { name: 'Compartir cuenta' })
    fireEvent.click(trigger)
    await screen.findByRole('menu', { name: 'Compartir la cuenta' })
    return trigger
  }

  it('ofrece una sola accion Compartir cuenta, no tres botones grandes', async () => {
    await abrirVerCuenta(conEmail() as ClientSummary)

    const trigger = await screen.findByRole('button', { name: 'Compartir cuenta' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('el menu ofrece email con la direccion del cliente, WhatsApp y PDF', async () => {
    await abrirMenuCompartir()

    const opciones = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(opciones[0]).toContain('Enviar por email')
    expect(opciones[0]).toContain('ana@correo.es')
    expect(opciones[1]).toBe('WhatsApp')
    expect(opciones[2]).toBe('Descargar PDF')
  })

  it('sin email explica que hay que anadirlo y lleva a la ficha', async () => {
    await abrirMenuCompartir({ ...summary('Ana', 1840, 'ana'), email: null } as ClientSummary)

    const opcion = screen.getAllByRole('menuitem')[0]
    expect(opcion.textContent).toContain('Añade un email al cliente para poder enviárselo.')

    fireEvent.click(opcion)
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeTruthy()
    expect(sendAccountSummaryEmail).not.toHaveBeenCalled()
  })

  it('envia el resumen y solo dice enviado cuando el servidor lo confirma', async () => {
    vi.mocked(sendAccountSummaryEmail).mockResolvedValue({ ok: true, recipient: 'ana@correo.es' })
    await abrirMenuCompartir()

    fireEvent.click(screen.getByRole('menuitem', { name: /Enviar por email/ }))

    await waitFor(() => expect(sendAccountSummaryEmail).toHaveBeenCalledWith('ana'))
    expect(await screen.findByText('✓ Resumen enviado a ana@correo.es')).toBeTruthy()
  })

  it('muestra el motivo en cristiano si el envio falla', async () => {
    vi.mocked(sendAccountSummaryEmail).mockResolvedValue({ ok: false, code: 'email_not_configured', message: 'Todavía no está configurado el envío de correos. Avisa a quien lleva la aplicación.' })
    await abrirMenuCompartir()

    fireEvent.click(screen.getByRole('menuitem', { name: /Enviar por email/ }))

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toContain('Todavía no está configurado')
    expect(aviso.textContent).not.toMatch(/500|JWT|payload|status/)
    expect(screen.queryByText(/Resumen enviado/)).toBeNull()
  })

  it('no envia dos veces por un doble click', async () => {
    let resolver: (value: { ok: true; recipient: string }) => void = () => {}
    vi.mocked(sendAccountSummaryEmail).mockReturnValue(new Promise((resolve) => { resolver = resolve }))
    await abrirMenuCompartir()

    const opcion = screen.getByRole('menuitem', { name: /Enviar por email/ })
    fireEvent.click(opcion)
    fireEvent.click(opcion)
    fireEvent.click(opcion)

    expect(sendAccountSummaryEmail).toHaveBeenCalledTimes(1)
    resolver({ ok: true, recipient: 'ana@correo.es' })
  })

  it('abre WhatsApp con el resumen preparado y sin datos privados', async () => {
    const abrir = vi.fn()
    vi.stubGlobal('open', abrir)
    await abrirMenuCompartir()

    fireEvent.click(screen.getByRole('menuitem', { name: 'WhatsApp' }))

    expect(abrir).toHaveBeenCalledTimes(1)
    const url = abrir.mock.calls[0][0] as string
    expect(url.startsWith('https://wa.me/')).toBe(true)
    const texto = decodeURIComponent(url.split('text=')[1])
    expect(texto).toContain('Ana')
    expect(texto).toContain('18,40')
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    for (const prohibido of ['note', 'nickname', 'store_id', 'photo_path', 'moroso', 'debes pagar']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('prepara el PDF al elegir descargar', async () => {
    const { generateAccountPdf } = await import('./lib/account-pdf')
    await abrirMenuCompartir()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Descargar PDF' }))

    await waitFor(() => expect(generateAccountPdf).toHaveBeenCalledTimes(1))
    const summaryPasado = vi.mocked(generateAccountPdf).mock.calls[0][0]
    expect(summaryPasado.clientName).toBe('Ana')
    expect(JSON.stringify(summaryPasado)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('el menu se cierra con Escape y al pulsar fuera', async () => {
    const trigger = await abrirMenuCompartir()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Compartir la cuenta' })).toBeNull())
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    await screen.findByRole('menu', { name: 'Compartir la cuenta' })
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Compartir la cuenta' })).toBeNull())
  })
})

describe('ajustes de redaccion', () => {
  // Reloj congelado: estos casos comparan dias naturales, y una pasada que cruce
  // la medianoche convertiria "desde hoy" en "hace 1 dia".
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-27T10:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('la nota del Resumen no muestra backticks literales', async () => {
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840, [ticket({ id: 't1', amount_cents: 1840 })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')

    const nota = await screen.findByText(/Los totales no cuentan movimientos anulados/)
    expect(nota.textContent).not.toContain('`')
    expect(nota.textContent).toContain('La última compra no incluye el saldo anterior.')
  })

  it('una deuda de hoy dice "desde hoy" en Ver cuenta, no "hace 0 días"', async () => {
    const hoy = new Date().toISOString()
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 1840), 1840, [ticket({ id: 't1', amount_cents: 1840, created_at: hoy })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver cuenta' }))

    await screen.findByRole('heading', { name: 'Ver cuenta' })
    expect(screen.getByText('Pendiente desde hoy')).toBeTruthy()
    expect(screen.queryByText(/hace 0 días/)).toBeNull()
  })

  it('un saldo anterior de hoy no dice "al menos 0 días"', async () => {
    const hoy = new Date().toISOString()
    vi.mocked(loadClientHistory).mockResolvedValue(history(summary('Ana', 8640), 8640, [ticket({ id: 'ob', amount_cents: 8640, origin: 'opening_balance', created_at: hoy })]))
    render(<Workspace user={user} />)
    await openFicha('Ana')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver cuenta' }))

    await screen.findByRole('heading', { name: 'Ver cuenta' })
    expect(screen.getByText('Pendiente desde hoy o antes')).toBeTruthy()
  })
})

describe('filtro Con deuda / Todos', () => {
  const conYSin = () => dashboard({
    clients: [summary('Ana', 1840, 'ana'), summary('Bruno', 0, 'bruno'), summary('Cris', 500, 'cris')],
    total: 2340,
  })

  it('por defecto muestra todos, con los contadores de cada opcion', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conYSin())
    render(<Workspace user={user} />)

    expect(await screen.findByRole('button', { name: 'Todos (3)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Con deuda (2)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Todos (3)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeTruthy()
  })

  it('Con deuda deja fuera a quien no debe nada', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conYSin())
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Con deuda (2)' }))

    expect(screen.getByRole('button', { name: /Ana/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cris/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Bruno/ })).toBeNull()
  })

  it('si busca a alguien sin deuda con el filtro puesto, explica por que no sale', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conYSin())
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Con deuda (2)' }))
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'Bruno' } })

    expect(screen.getByText('No aparece porque no tiene deuda.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeTruthy()
  })

  it('la busqueda sigue funcionando dentro del filtro activo', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(conYSin())
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Con deuda (2)' }))
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'Ana' } })

    expect(screen.getByRole('button', { name: /Ana/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cris/ })).toBeNull()
  })

  it('un cliente que queda a cero desaparece de Con deuda', async () => {
    vi.mocked(loadDashboard).mockResolvedValue(dashboard({ clients: [summary('Ana', 0, 'ana')], total: 0 }))
    render(<Workspace user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Con deuda (0)' }))

    expect(screen.queryByRole('button', { name: /Ana/ })).toBeNull()
  })
})
