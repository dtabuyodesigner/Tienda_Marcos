import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  attachClientPhoto,
  attachTicketPhoto,
  createClient,
  createOpeningBalance,
  createPayment,
  createTicket,
  hasActiveOpeningBalance,
  isDuplicateOpeningBalance,
  isOpeningBalance,
  loadClientHistory,
  loadDashboard,
  removeClientPhoto,
  sendAccountSummaryEmail,
  signedPhotoUrl,
  updateClientEmail,
  signedPhotoUrls,
  voidMovement,
  type Client,
  type ClientSummary,
  type Payment,
  type Ticket,
} from './lib/data'
import {
  canChargeClient,
  canRegisterPayment,
  formatCents,
  needsHighTicketConfirmation,
  openingBalanceConfirmation,
  parseEuroToCents,
  recentClients,
  searchClients,
  sortClientsForHome,
} from './lib/money'
import { accountDisplayName, accountInitial, MIN_PASSWORD_LENGTH, passwordProblem, signUpMessage } from './lib/account'
import { Help } from './Help'
import { summarizeClientMovements } from './lib/summary'
import { agingSentence, computeAging, isOverdue, OVERDUE_THRESHOLD_DAYS } from './lib/aging'
import { buildStoreOverview, type StoreOverview } from './lib/overview'
import { buildAccountView } from './lib/account-view'
import { buildAccountSummary, type AccountSummary } from '../supabase/functions/_shared/account-summary'
import { accountPdfFileName, generateAccountPdf } from './lib/account-pdf'
import { formatAccountWhatsApp, normalizeSpanishPhone, whatsAppShareUrl } from './lib/account-share-text'
import { emailProblem, normalizeEmail } from './lib/email'

type View = 'home' | 'new-client' | 'choose-client' | 'purchase' | 'client' | 'ticket' | 'charge' | 'opening-balance' | 'history' | 'account' | 'settings' | 'help' | 'overview'
type Notice = { tone: 'success' | 'error'; title?: string; message: string }
/** Los avisos de exito son efimeros: un ✓ viejo puede leerse como la accion recien hecha. */
export const SUCCESS_NOTICE_MS = 6000
type DisplayMovement = (Ticket & { kind: 'ticket' }) | (Payment & { kind: 'payment' })

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recoveringPassword, setRecoveringPassword] = useState(false)

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) setRecoveringPassword(true)
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true)
      setSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <main className="shell"><p>Cargando sesión...</p></main>
  if (recoveringPassword && session) return <ResetPassword onDone={() => setRecoveringPassword(false)} />
  return session ? <Workspace user={session.user} /> : <Login />
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forgotPassword, setForgotPassword] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) setError('No se pudo iniciar sesión. Revisa tus datos.')
    setBusy(false)
  }

  if (forgotPassword) return <ForgotPassword initialEmail={email} onBack={() => setForgotPassword(false)} />
  if (creatingAccount) return <SignUp onBack={() => setCreatingAccount(false)} />
  return <main className="shell"><section className="panel login"><p className="eyebrow">La Libreta de Marcos</p><h1>Tu tienda, en orden.</h1><p className="muted">Accede para gestionar tus compras fiadas.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Entrando...' : 'Iniciar sesión'}</button><button type="button" className="text-button forgot-link" onClick={() => setForgotPassword(true)}>¿Has olvidado tu contraseña?</button></form><div className="login-alt"><span className="muted">¿Todavía no tienes cuenta?</span><button type="button" className="secondary-action subtle-action" onClick={() => setCreatingAccount(true)}>Crear mi cuenta</button></div></section></main>
}

function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setSent(false)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
    if (resetError) setError('No se pudo enviar el enlace. Revisa el email.')
    else setSent(true)
    setBusy(false)
  }

  return <form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{error && <p className="error" role="alert">{error}</p>}{sent && <p className="notice success" role="status">Te hemos enviado un enlace para cambiar la contraseña.</p>}<button disabled={busy}>{busy ? 'Enviando...' : 'Enviar enlace'}</button></form>
}

function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  return <main className="shell"><section className="panel login"><button className="back" onClick={onBack}>← Volver</button><p className="eyebrow">La Libreta de Marcos</p><h1>Recuperar contraseña</h1><ForgotPasswordForm initialEmail={initialEmail} /></section></main>
}

/**
 * Alta de cuenta. El registro no es publico: hace falta un codigo de invitacion.
 * La comprobacion previa del codigo es solo para dar un mensaje util; quien
 * autoriza de verdad es el alta en base de datos, que consume la invitacion en
 * la misma transaccion que crea el usuario.
 */
function SignUp({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatedPassword, setRepeatedPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmEmail, setConfirmEmail] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!name.trim() || !storeName.trim()) { setError('Pon tu nombre y el nombre de la tienda.'); return }
    if (!invite.trim()) { setError('Necesitas un código de invitación para crear la cuenta.'); return }
    const problem = passwordProblem(password, repeatedPassword)
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    const { data: available, error: checkError } = await supabase.rpc('invite_is_available', { code: invite.trim() })
    if (!checkError && available === false) {
      setError('Ese código de invitación no es válido o ya se ha usado.')
      setBusy(false)
      return
    }
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { display_name: name.trim(), store_name: storeName.trim(), invite_code: invite.trim() } },
    })
    if (signUpError) { setError(signUpMessage(signUpError.message)); setBusy(false); return }
    // Sin identidades: Supabase oculta que el email ya existe para no filtrarlo.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('Ese email ya tiene cuenta. Inicia sesión o recupera la contraseña.')
      setBusy(false)
      return
    }
    // Con sesion se entra directo; sin ella, Auth pide confirmar el correo.
    if (!data.session) setConfirmEmail(true)
    setBusy(false)
  }

  if (confirmEmail) return <main className="shell"><section className="panel login"><p className="eyebrow">La Libreta de Marcos</p><h1>✓ Cuenta creada</h1><p className="notice success" role="status">Te hemos enviado un enlace para confirmar tu email. Ábrelo desde este móvil y ya podrás entrar.</p><button type="button" className="secondary-action" onClick={onBack}>Volver a iniciar sesión</button></section></main>

  return <main className="shell"><section className="panel login"><button className="back" onClick={onBack}>← Volver</button><p className="eyebrow">La Libreta de Marcos</p><h1>Crear mi cuenta</h1><p className="muted">La Libreta todavía es privada: necesitas un código de invitación.</p><form onSubmit={submit}><label>Tu nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Nombre de la tienda<input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Covirán San Miguel" required /></label><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Contraseña<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>Repetir contraseña<input type="password" autoComplete="new-password" value={repeatedPassword} onChange={(event) => setRepeatedPassword(event.target.value)} required /></label><label>Código de invitación<input value={invite} onChange={(event) => setInvite(event.target.value)} autoCapitalize="characters" spellCheck={false} required /></label><p className="muted">Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.</p>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Creando cuenta...' : 'Crear mi cuenta'}</button></form></section></main>
}

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError('No se pudo cambiar la contraseña. Vuelve a pedir el enlace.')
    else onDone()
    setBusy(false)
  }

  return <main className="shell"><section className="panel login"><p className="eyebrow">La Libreta de Marcos</p><h1>Nueva contraseña</h1><form onSubmit={submit}><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : 'Guardar contraseña'}</button></form></section></main>
}

export function Workspace({ user }: { user: User }) {
  const [view, setView] = useState<View>('home')
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [total, setTotal] = useState(0)
  const [selectedClient, setSelectedClient] = useState<Client | ClientSummary | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [newClientOrigin, setNewClientOrigin] = useState<'home' | 'client'>('home')
  const [supportsOpeningBalance, setSupportsOpeningBalance] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [supportsClientPhoto, setSupportsClientPhoto] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [movements, setMovements] = useState<{ tickets: Ticket[]; payments: Payment[] }>({ tickets: [], payments: [] })

  async function refresh(options: { keepNotice?: boolean } = {}) {
    setRefreshing(true)
    try {
      const dashboard = await loadDashboard(user)
      setClients(dashboard.clients)
      setTotal(dashboard.total)
      setSupportsOpeningBalance(dashboard.supportsOpeningBalance)
      setSupportsClientPhoto(dashboard.supportsClientPhoto)
      setPhotoUrls(dashboard.photoUrls)
      setMovements({ tickets: dashboard.tickets, payments: dashboard.payments })
      setDisplayName(dashboard.displayName)
      if (!options.keepNotice) setNotice(null)
    } catch {
      setNotice({ tone: 'error', message: 'No se pudieron cargar los datos. Comprueba la conexión y vuelve a intentarlo.' })
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    if (notice?.tone !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Navegar descarta la confirmacion anterior. Los errores se mantienen:
  // siguen siendo ciertos y necesitan atencion hasta que una carga correcta los resuelva.
  function go(next: View) {
    setNotice((current) => (current?.tone === 'error' ? current : null))
    setView(next)
  }

  function openClient(client: Client | ClientSummary) {
    setSelectedClient(client)
    go('client')
  }

  function openNewClient(origin: 'home' | 'client') {
    setNewClientOrigin(origin)
    go('new-client')
  }

  async function finishPurchase(ticket: Ticket, client: Client | ClientSummary) {
    setSelectedTicket(ticket)
    try {
      const history = await loadClientHistory(user, client.id)
      setSelectedClient({ ...history.client, balance: history.balance, lastActivityAt: ticket.created_at })
      setNotice({ tone: 'success', title: '✓ Compra apuntada', message: `${client.name} debe ahora ${formatCents(history.balance)}` })
      await refresh({ keepNotice: true })
    } catch {
      setNotice({ tone: 'error', title: 'Compra apuntada', message: 'La compra se guardó, pero no se pudo leer el saldo actualizado. Comprueba la conexión.' })
    } finally {
      setView('client')
    }
  }

  async function finishPayment(client: Client | ClientSummary, paidCents: number) {
    try {
      const history = await loadClientHistory(user, client.id)
      setSelectedClient({ ...history.client, balance: history.balance, lastActivityAt: new Date().toISOString() })
      setNotice(history.balance === 0
        ? { tone: 'success', title: `✓ Cobrado ${formatCents(paidCents)}`, message: `${client.name} ya no debe nada` }
        : { tone: 'success', title: '✓ Pago registrado', message: `A ${client.name} le quedan ${formatCents(history.balance)}` })
      await refresh({ keepNotice: true })
    } catch {
      setNotice({ tone: 'error', title: `Cobro registrado (${formatCents(paidCents)})`, message: 'El pago se guardó, pero no se pudo leer el saldo actualizado. Comprueba la conexión.' })
    } finally {
      setView('client')
    }
  }

  async function finishOpeningBalance(client: Client | ClientSummary, addedCents: number) {
    try {
      const history = await loadClientHistory(user, client.id)
      setSelectedClient({ ...history.client, balance: history.balance, lastActivityAt: new Date().toISOString() })
      setNotice({ tone: 'success', title: '✓ Saldo anterior añadido', message: `Ahora ${client.name} debe ${formatCents(history.balance)}` })
      await refresh({ keepNotice: true })
    } catch {
      setNotice({ tone: 'error', title: `Saldo anterior añadido (${formatCents(addedCents)})`, message: 'Se guardó, pero no se pudo leer el saldo actualizado. Comprueba la conexión.' })
    } finally {
      setView('client')
    }
  }

  // La antiguedad y el resumen se derivan de los movimientos que el panel ya
  // trajo en la misma carga: ni una consulta extra por cliente.
  const now = new Date()
  const overview = useMemo(() => buildStoreOverview(clients, movements.tickets, movements.payments, now), [clients, movements])
  // Se pide la signed URL de la foto nueva en el momento para que el avatar no
  // parpadee al inicial mientras llega el refresco del panel.
  async function finishClientChange(updated: Client) {
    setSelectedClient((current) => (current ? { ...current, ...updated } : updated))
    const fresh = updated.photo_path ? await signedPhotoUrls([updated.photo_path]) : {}
    setPhotoUrls((current) => {
      const next = { ...current }
      const url = updated.photo_path ? fresh[updated.photo_path] : undefined
      if (url) next[updated.id] = url
      else delete next[updated.id]
      return next
    })
    await refresh({ keepNotice: true })
  }

  if (refreshing && clients.length === 0) return <main className="shell"><p>Cargando tu libreta...</p></main>
  return <main className="app-shell"><header className="topbar"><div className="topbar-row"><button className="brand-button" onClick={() => go('home')}><img className="brand-logo" src="/logo-header.webp" alt="La Libreta de Marcos" /></button><UserMenu name={accountDisplayName(displayName, user.email)} onOverview={() => go('overview')} onAccount={() => go('settings')} onHelp={() => go('help')} onSignOut={() => void supabase.auth.signOut()} /></div><span className="brand-place">Covirán · San Miguel de las Dueñas · El Bierzo · León</span></header><div className="content">{notice && <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.title && <strong>{notice.title}</strong>}<span>{notice.message}</span></div>}{view === 'home' && <Home clients={clients} total={total} busy={refreshing} photoUrls={photoUrls} overview={overview} onClientById={(id) => { const found = clients.find((client) => client.id === id); if (found) openClient(found) }} onOverview={() => go('overview')} onClient={openClient} onNew={() => openNewClient('home')} onBuy={() => go('choose-client')} />}{view === 'new-client' && <NewClient user={user} canAddPhoto={supportsClientPhoto} allowContinue={newClientOrigin !== 'client'} onBack={() => go(newClientOrigin === 'client' && selectedClient ? 'client' : 'home')} onCreated={(client, continuePurchase, photoFailed) => { setSelectedClient(client); setNotice(photoFailed ? { tone: 'error', title: `${client.name} creado, pero la foto no se guardó`, message: 'Puedes añadirla desde su ficha.' } : { tone: 'success', title: `✓ ${client.name} creado correctamente`, message: 'Ya está en tu libreta.' }); void refresh({ keepNotice: true }); setView(continuePurchase ? 'purchase' : 'client') }} />}{view === 'choose-client' && <ChooseClient clients={clients} photoUrls={photoUrls} onBack={() => go('home')} onClient={(client) => { setSelectedClient(client); go('purchase') }} onNew={() => openNewClient('home')} />}{view === 'purchase' && selectedClient && <Purchase user={user} client={selectedClient} photoUrl={photoUrls[selectedClient.id]} onBack={() => go('choose-client')} onSaved={(ticket) => finishPurchase(ticket, selectedClient)} />}{view === 'client' && selectedClient && <ClientPage user={user} client={selectedClient} canAddOpeningBalance={supportsOpeningBalance} canManagePhoto={supportsClientPhoto} photoUrl={photoUrls[selectedClient.id]} onClientChanged={finishClientChange} onBack={() => go('home')} onBuy={() => go('purchase')} onCharge={() => go('charge')} onNewClient={() => openNewClient('client')} onOpeningBalance={() => go('opening-balance')} onTicket={(ticket) => { setSelectedTicket(ticket); go('ticket') }} onHistory={() => go('history')} onAccount={() => go('account')} />}{view === 'opening-balance' && selectedClient && <OpeningBalance user={user} client={selectedClient} photoUrl={photoUrls[selectedClient.id]} onBack={() => go('client')} onSaved={(addedCents) => finishOpeningBalance(selectedClient, addedCents)} />}{view === 'ticket' && selectedTicket && <TicketPage user={user} ticket={selectedTicket} onBack={() => go('client')} onChanged={() => { void refresh(); go('client') }} />}{view === 'charge' && selectedClient && <Charge user={user} client={selectedClient} onBack={() => go('client')} onPaid={(paidCents) => finishPayment(selectedClient, paidCents)} />}{view === 'history' && selectedClient && <History user={user} client={selectedClient} photoUrl={photoUrls[selectedClient.id]} onBack={() => go('client')} onTicket={(ticket) => { setSelectedTicket(ticket); go('ticket') }} />}{view === 'account' && selectedClient && <AccountView user={user} client={selectedClient} photoUrl={photoUrls[selectedClient.id]} onBack={() => go('client')} onTicket={(ticket) => { setSelectedTicket(ticket); go('ticket') }} />}{view === 'settings' && <Settings user={user} onBack={() => go('home')} />}{view === 'help' && <Help onBack={() => go('home')} />}{view === 'overview' && <Overview overview={overview} onBack={() => go('home')} onClient={(id) => { const found = clients.find((client) => client.id === id); if (found) openClient(found) }} />}</div></main>
}

/**
 * Control unico de usuario de la cabecera. Sustituye a los enlaces sueltos
 * `Cuenta` y `Salir`, que daban demasiado protagonismo al cierre de sesion.
 * Menu propio en lugar de libreria: son dos opciones.
 */
function UserMenu({ name, onOverview, onAccount, onHelp, onSignOut }: { name: string; onOverview: () => void; onAccount: () => void; onHelp: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  // Al abrir se lleva el foco a la primera opcion: es lo que espera un menu con role="menu".
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  function moveFocus(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1
    items[(next + items.length) % items.length].focus()
  }

  function choose(action: () => void) {
    setOpen(false)
    action()
  }

  return <div className="user-menu" ref={containerRef}>
    <button ref={triggerRef} type="button" className="user-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="user-avatar" aria-hidden="true">{accountInitial(name)}</span>
      <span className="user-name">{name}</span>
      <span className="user-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div ref={panelRef} className="user-panel" role="menu" aria-label="Opciones de usuario" onKeyDown={moveFocus}>
      <button type="button" role="menuitem" className="user-option" onClick={() => choose(onOverview)}>Resumen</button><button type="button" role="menuitem" className="user-option" onClick={() => choose(onAccount)}>Cuenta</button><button type="button" role="menuitem" className="user-option" onClick={() => choose(onHelp)}>Ayuda</button>
      <button type="button" role="menuitem" className="user-option user-option-danger" onClick={() => choose(onSignOut)}>Cerrar sesión</button>
    </div>}
  </div>
}

/** Antiguedad en texto. El saldo anterior solo permite afirmar una cota inferior. */
function ageLabel(days: number, approximate: boolean): string {
  return `${approximate ? 'al menos ' : ''}${days} ${days === 1 ? 'día' : 'días'}`
}

function OverdueNotice({ overview, onClient, onAll }: { overview: StoreOverview; onClient: (clientId: string) => void; onAll: () => void }) {
  // Sin cuentas antiguas no se muestra un bloque vacio.
  if (overview.overdueCount === 0) return null
  const visible = overview.overdueAccounts.slice(0, 3)
  return <section className="overdue" aria-label="Cuentas pendientes desde hace tiempo"><h2>⚠ {overview.overdueCount === 1 ? 'Una cuenta lleva' : `${overview.overdueCount} cuentas llevan`} más de {OVERDUE_THRESHOLD_DAYS} días pendientes</h2><div className="overdue-list">{visible.map((account) => <button className="overdue-row" key={account.clientId} onClick={() => onClient(account.clientId)}><strong>{account.name}</strong><span>{formatCents(account.balanceCents)} · {ageLabel(account.ageInDays, account.approximate)}</span></button>)}</div>{overview.overdueCount > visible.length && <button type="button" className="text-button" onClick={onAll}>Ver todas</button>}</section>
}

/**
 * Compartir la cuenta por email, WhatsApp o PDF.
 * Los tres canales parten del mismo modelo canonico: no hay tres calculos.
 */
function ShareMenu({ summary, clientId, clientEmail, clientPhone, onAddEmail }: { summary: AccountSummary; clientId: string; clientEmail: string | null; clientPhone: string | null; onAddEmail: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => { if (open) panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus() }, [open])

  async function sendEmail() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    // Nunca se anuncia "enviado" antes de que el servidor lo confirme.
    const result = await sendAccountSummaryEmail(clientId)
    setBusy(false)
    setOpen(false)
    setNotice(result.ok
      ? { tone: 'success', text: `✓ Resumen enviado a ${result.recipient}` }
      : { tone: 'error', text: result.message })
  }

  async function downloadPdf() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const blob = await generateAccountPdf(summary)
      const fileName = accountPdfFileName(summary)
      // En movil se ofrece compartir el fichero si el navegador lo soporta; si
      // no, descarga normal. Nunca se depende solo de Web Share.
      const shareFiles = typeof File === 'function' ? [new File([blob], fileName, { type: 'application/pdf' })] : []
      if (shareFiles.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files: shareFiles })) {
        try {
          await navigator.share({ files: shareFiles, title: `Cuenta de ${summary.clientName}` })
          setOpen(false)
          return
        } catch {
          // cancelado o no soportado de verdad: se descarga
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch {
      setNotice({ tone: 'error', text: 'No se pudo preparar el PDF. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  function openWhatsApp() {
    const url = whatsAppShareUrl(formatAccountWhatsApp(summary), normalizeSpanishPhone(clientPhone))
    window.open(url, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return <div className="share" ref={containerRef}>
    <button ref={triggerRef} type="button" className="secondary-action subtle-action share-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Compartir cuenta</button>
    {open && <div ref={panelRef} className="user-panel share-panel" role="menu" aria-label="Compartir la cuenta">
      {clientEmail
        ? <button type="button" role="menuitem" className="user-option" disabled={busy} onClick={() => void sendEmail()}><span>{busy ? 'Enviando...' : 'Enviar por email'}</span><small>{clientEmail}</small></button>
        : <button type="button" role="menuitem" className="user-option" onClick={() => { setOpen(false); onAddEmail() }}><span>Enviar por email</span><small>Añade un email al cliente para poder enviárselo.</small></button>}
      <button type="button" role="menuitem" className="user-option" onClick={openWhatsApp}>WhatsApp</button>
      <button type="button" role="menuitem" className="user-option" disabled={busy} onClick={() => void downloadPdf()}>{busy ? 'Preparando...' : 'Descargar PDF'}</button>
    </div>}
    {notice && <p className={notice.tone === 'success' ? 'notice success share-notice' : 'error share-notice'} role={notice.tone === 'success' ? 'status' : 'alert'}>{notice.text}</p>}
  </div>
}

function Overview({ overview, onBack, onClient }: { overview: StoreOverview; onBack: () => void; onClient: (clientId: string) => void }) {
  return <FormPage title="Resumen" onBack={onBack}><section className="summary"><h2>Ahora mismo</h2><dl className="summary-grid"><div><dt>Pendiente total</dt><dd>{formatCents(overview.totalPendingCents)}</dd></div><div><dt>Clientes con deuda</dt><dd>{overview.clientsWithDebt}</dd></div><div><dt>Cuentas de más de {OVERDUE_THRESHOLD_DAYS} días</dt><dd>{overview.overdueCount}</dd></div><div><dt>Deuda de más de {OVERDUE_THRESHOLD_DAYS} días</dt><dd>{formatCents(overview.overdueCents)}</dd></div></dl><p className="muted summary-note">La deuda de más de {OVERDUE_THRESHOLD_DAYS} días cuenta solo la parte que lleva ese tiempo sin pagarse, no el saldo entero de esas cuentas.</p></section><section className="summary"><h2>Este mes</h2><dl className="summary-grid"><div><dt>Compras fiadas</dt><dd>{formatCents(overview.monthPurchaseCents)}</dd></div><div><dt>Número de compras</dt><dd>{overview.monthPurchaseCount}</dd></div><div><dt>Cobrado</dt><dd>{formatCents(overview.monthPaymentCents)}</dd></div><div><dt>Número de cobros</dt><dd>{overview.monthPaymentCount}</dd></div></dl><p className="muted summary-note">No cuentan movimientos anulados. Un saldo anterior no es una compra del mes aunque se apuntase este mes.</p></section>{overview.overdueAccounts.length > 0 && <><div className="section-heading"><h2>Cuentas más antiguas</h2></div><div className="overdue-list">{overview.overdueAccounts.slice(0, 5).map((account) => <button className="overdue-row" key={account.clientId} onClick={() => onClient(account.clientId)}><strong>{account.name}</strong><span>{formatCents(account.balanceCents)} · {ageLabel(account.ageInDays, account.approximate)}</span></button>)}</div></>}</FormPage>
}

function Home({ clients, total, busy, photoUrls, overview, onClient, onClientById, onOverview, onNew, onBuy }: { clients: ClientSummary[]; total: number; busy: boolean; photoUrls: Record<string, string>; overview: StoreOverview; onClient: (client: ClientSummary) => void; onClientById: (clientId: string) => void; onOverview: () => void; onNew: () => void; onBuy: () => void }) {
  const [query, setQuery] = useState('')
  const visible = searchClients(sortClientsForHome(clients), query)
  return <><section className="hero"><div><span className="label">Pendiente de cobrar</span><strong>{formatCents(total)}</strong></div><button className="primary-action" onClick={onBuy}>+ Apuntar compra</button></section><OverdueNotice overview={overview} onClient={onClientById} onAll={onOverview} /><div className="section-heading home-heading"><h2>Clientes</h2><button className="secondary-action small-action" onClick={onNew}>Nuevo cliente</button></div><input className="search" placeholder="Buscar por nombre o apodo" value={query} onChange={(event) => setQuery(event.target.value)} />{busy ? <p className="muted">Actualizando...</p> : <div className="client-list">{visible.map((client) => <ClientRow client={client} photoUrl={photoUrls[client.id]} key={client.id} onClick={() => onClient(client)} />)}{clients.length === 0 && <div className="empty"><strong>Todavía no tienes clientes.</strong><span>Crea el primero o apunta una compra.</span></div>}{clients.length > 0 && visible.length === 0 && <p className="empty">No hay clientes que coincidan.</p>}</div>}</>
}

/**
 * Foto del cliente cuando existe, inicial cuando no.
 * Si la imagen no carga (signed URL caducada, red) cae a la inicial en vez de
 * dejar un hueco roto.
 */
function Avatar({ name, photoUrl, large = false }: { name: string; photoUrl?: string; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [photoUrl])
  const className = large ? 'avatar avatar-large' : 'avatar'
  if (photoUrl && !broken) return <img className={`${className} avatar-photo`} src={photoUrl} alt="" onError={() => setBroken(true)} />
  return <span className={className} aria-hidden="true">{accountInitial(name)}</span>
}

function ClientRow({ client, photoUrl, onClick }: { client: ClientSummary; photoUrl?: string; onClick: () => void }) {
  return <button className="client-row" onClick={onClick}><Avatar name={client.name} photoUrl={photoUrl} /><span className="client-name"><strong>{client.name}</strong>{client.nickname && <small>{client.nickname}</small>}</span><strong className={client.balance > 0 ? 'debt' : 'paid'}>{formatCents(client.balance)}</strong></button>
}

function NewClient({ user, canAddPhoto, onBack, onCreated, allowContinue = true }: { user: User; canAddPhoto: boolean; onBack: () => void; onCreated: (client: Client, continuePurchase: boolean, photoFailed: boolean) => void; allowContinue?: boolean }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [continuePurchase, setContinuePurchase] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const photoInputId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const emailIssue = emailProblem(email)
    if (emailIssue) { setError(emailIssue); return }
    setBusy(true)
    setError('')
    let created: Client
    try {
      created = await createClient(user, { name, phone, nickname, note, email: normalizeEmail(email) })
    } catch {
      setError('No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.')
      setBusy(false)
      return
    }
    // El cliente ya existe: la foto no puede tumbar el alta ni provocar un duplicado.
    let photoFailed = false
    if (photo) {
      try {
        created = await attachClientPhoto(user, created, photo)
      } catch {
        photoFailed = true
      }
    }
    setBusy(false)
    onCreated(created, allowContinue && continuePurchase, photoFailed)
  }

  return <FormPage title="Nuevo cliente" onBack={onBack}><form onSubmit={submit}><label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Apodo o referencia <span className="muted">(opcional)</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Pepe el de la plaza" maxLength={80} /></label><label>Teléfono <span className="muted">(opcional)</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Email <span className="muted">(opcional)</span><input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Para enviarle su cuenta más adelante" /></label><label>Nota corta <span className="muted">(opcional)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Madre de Lucía" maxLength={160} /></label>{canAddPhoto && <div className="photo-input"><span className="label">Foto del cliente <span className="muted">(opcional)</span></span><input id={photoInputId} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /><label className="photo-button" htmlFor={photoInputId}>Hacer o elegir foto</label>{photo && <button type="button" className="text-button" onClick={() => setPhoto(null)}>Quitar foto</button>}</div>}{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : allowContinue && continuePurchase ? 'Crear y continuar' : 'Crear cliente'}</button>{allowContinue && <label className="check"><input type="checkbox" checked={continuePurchase} onChange={(event) => setContinuePurchase(event.target.checked)} /> Crear y continuar con una compra</label>}</form></FormPage>
}

function ChooseClient({ clients, photoUrls, onBack, onClient, onNew }: { clients: ClientSummary[]; photoUrls: Record<string, string>; onBack: () => void; onClient: (client: ClientSummary) => void; onNew: () => void }) {
  const [query, setQuery] = useState('')
  const hasQuery = query.trim().length > 0
  const ordered = sortClientsForHome(clients)
  const visible = searchClients(ordered, query)
  const recents = recentClients(clients, 4)
  const visibleWithoutRecents = hasQuery ? visible : visible.filter((client) => !recents.some((recent) => recent.id === client.id))
  return <FormPage title="¿A quién se lo apuntamos?" onBack={onBack}><input autoFocus className="search" placeholder="Buscar cliente" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="secondary-action create-before-list" onClick={onNew}>+ Nuevo cliente</button>{!hasQuery && recents.length > 0 && <section className="compact-section"><h2>Recientes</h2><div className="client-list">{recents.map((client) => <ClientRow client={client} photoUrl={photoUrls[client.id]} key={client.id} onClick={() => onClient(client)} />)}</div></section>}<section className="compact-section"><h2>{hasQuery ? 'Resultados' : 'Todos'}</h2><div className="client-list">{visibleWithoutRecents.map((client) => <ClientRow client={client} photoUrl={photoUrls[client.id]} key={client.id} onClick={() => onClient(client)} />)}{clients.length === 0 && <div className="empty"><strong>Todavía no tienes clientes.</strong><span>Crea el primero y continúa con la compra.</span></div>}{clients.length > 0 && visible.length === 0 && <p className="empty">No hay clientes que coincidan.</p>}</div></section></FormPage>
}

function Purchase({ user, client, photoUrl, onBack, onSaved }: { user: User; client: Client | ClientSummary; photoUrl?: string; onBack: () => void; onSaved: (ticket: Ticket) => void | Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [concept, setConcept] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [existingTicket, setExistingTicket] = useState<Ticket | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const photoInputId = useId()
  const previewUrl = useMemo(() => photo ? URL.createObjectURL(photo) : '', [photo])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const cents = parseEuroToCents(amount)
    if (cents === null) { setError('Introduce un importe válido, por ejemplo 18,40.'); return }
    if (needsHighTicketConfirmation(cents) && !window.confirm(`Vas a apuntar ${formatCents(cents)} a ${client.name}.\n¿Es correcto?`)) return
    setBusy(true)
    setError('')
    try {
      let ticket = await createTicket(user, client.id, cents, concept)
      setExistingTicket(ticket)
      if (photo) ticket = await attachTicketPhoto(ticket, photo)
      await onSaved(ticket)
    } catch {
      setError(photo ? 'El ticket existe, pero la foto no se pudo guardar. Elige otra foto y reintenta sin crear otra compra.' : 'No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  async function retryPhoto() {
    if (!existingTicket || !photo || busy) return
    setBusy(true)
    setError('')
    try {
      await onSaved(await attachTicketPhoto(existingTicket, photo))
    } catch {
      setError('No se pudo guardar la foto. Puedes volver a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  return <FormPage title="Nueva compra" onBack={onBack}><div className="selected"><Avatar name={client.name} photoUrl={photoUrl} /><strong>{client.name}</strong></div><form onSubmit={submit}><label>Importe<input inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={Boolean(existingTicket)} /></label><label>Concepto <span className="muted">(opcional)</span><input value={concept} onChange={(event) => setConcept(event.target.value)} disabled={Boolean(existingTicket)} /></label><div className="photo-input"><span className="label">Foto del ticket <span className="muted">(opcional)</span></span><input id={photoInputId} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /><label className="photo-button" htmlFor={photoInputId}>Hacer foto del ticket</label><span className="field-hint">Opcional. Sirve por si luego hay dudas de qué se llevó.</span>{photo && <button type="button" className="text-button" onClick={() => setPhoto(null)}>Quitar foto</button>}</div>{photo && <div className="photo-preview"><img src={previewUrl} alt="Vista previa de la foto del ticket" /><span>{photo.name}</span></div>}{error && <p className="error">{error}</p>}{existingTicket ? <button type="button" disabled={busy || !photo} onClick={() => void retryPhoto()}>{busy ? 'Reintentando...' : 'Reintentar foto'}</button> : <button disabled={busy}>{busy ? 'Guardando...' : 'Guardar compra'}</button>}</form></FormPage>
}

function ClientPage({ user, client, canAddOpeningBalance, canManagePhoto, photoUrl, onBack, onBuy, onCharge, onNewClient, onOpeningBalance, onClientChanged, onTicket, onHistory, onAccount }: { user: User; client: Client | ClientSummary; canAddOpeningBalance: boolean; canManagePhoto: boolean; photoUrl?: string; onBack: () => void; onBuy: () => void; onCharge: () => void; onNewClient: () => void; onOpeningBalance: () => void; onClientChanged: (updated: Client) => void | Promise<void>; onTicket: (ticket: Ticket) => void; onHistory: () => void; onAccount: () => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  const [error, setError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputId = useId()
  const [editingEmail, setEditingEmail] = useState(false)
  const [email, setEmail] = useState(client.email ?? '')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')

  async function saveEmail(event: FormEvent) {
    event.preventDefault()
    if (emailBusy) return
    const problem = emailProblem(email)
    if (problem) { setEmailError(problem); return }
    setEmailBusy(true)
    setEmailError('')
    try {
      await onClientChanged(await updateClientEmail(user, client, normalizeEmail(email)))
      setEditingEmail(false)
    } catch {
      setEmailError('No se pudo guardar el email. Vuelve a intentarlo.')
    } finally {
      setEmailBusy(false)
    }
  }

  async function replacePhoto(file: File | null) {
    if (!file || photoBusy) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await onClientChanged(await attachClientPhoto(user, client, file))
    } catch {
      setPhotoError('No se pudo guardar la foto. Vuelve a intentarlo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function dropPhoto() {
    if (photoBusy || !window.confirm('¿Quitar la foto de este cliente? Su historial no cambia.')) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await onClientChanged(await removeClientPhoto(user, client))
    } catch {
      setPhotoError('No se pudo quitar la foto. Vuelve a intentarlo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  useEffect(() => { void loadClientHistory(user, client.id).then(setData).catch(() => setError('No se pudo cargar la ficha. Comprueba la conexión.')) }, [user, client.id])

  const balance = data?.balance ?? ('balance' in client ? client.balance : 0)
  const stats = data ? summarizeClientMovements(data.tickets, data.payments) : null
  const aging = data ? computeAging(data.tickets, data.payments, new Date()) : null
  return <FormPage title={client.name} onBack={onBack} leading={<Avatar name={client.name} photoUrl={photoUrl} large />} action={<button className="secondary-action subtle-action heading-action" onClick={onNewClient}>+ Crear otro cliente</button>}>{canManagePhoto && <div className="photo-controls"><input id={photoInputId} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={(event) => void replacePhoto(event.target.files?.[0] ?? null)} /><label className="text-button photo-control" htmlFor={photoInputId}>{photoBusy ? 'Guardando foto...' : client.photo_path ? 'Cambiar foto' : 'Añadir foto'}</label>{client.photo_path && <button type="button" className="text-button photo-control" disabled={photoBusy} onClick={() => void dropPhoto()}>Quitar foto</button>}</div>}{photoError && <p className="error" role="alert">{photoError}</p>}{editingEmail ? <form className="email-edit" onSubmit={saveEmail}><label>Email del cliente <span className="muted">(opcional)</span><input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sin email" /></label>{emailError && <p className="error" role="alert">{emailError}</p>}<div className="email-actions"><button disabled={emailBusy}>{emailBusy ? 'Guardando...' : 'Guardar email'}</button><button type="button" className="text-button" onClick={() => { setEditingEmail(false); setEmail(client.email ?? ''); setEmailError('') }}>Cancelar</button></div></form> : <div className="photo-controls"><button type="button" className="text-button photo-control" onClick={() => setEditingEmail(true)}>{client.email ? `Email: ${client.email}` : 'Añadir email'}</button></div>}<div className="balance-card"><span className="label">{balance > 0 ? 'Deuda actual' : 'Estado'}</span><strong>{balance > 0 ? formatCents(balance) : 'No debe nada'}</strong>{client.note && <p>{client.note}</p>}</div><div className="actions"><button className="primary-action" onClick={onBuy}>+ Nueva compra</button>{canChargeClient(balance) && <button className="secondary-action" onClick={onCharge}>Cobrar {formatCents(balance)}</button>}</div><div className="secondary-actions"><button className="secondary-action subtle-action" onClick={onHistory}>Ver historial</button><button className="secondary-action subtle-action" onClick={onAccount}>Ver cuenta</button>{canAddOpeningBalance && data && !hasActiveOpeningBalance(data.tickets) && <button className="secondary-action subtle-action" onClick={onOpeningBalance}>Añadir saldo anterior</button>}</div>{aging && isOverdue(aging) && aging.ageInDays !== null && <p className="overdue-mark">{agingSentence(aging.ageInDays, aging.approximate)}</p>}{stats && <section className="summary"><h2>Resumen</h2><dl className="summary-grid"><div><dt>Movimientos de deuda activos</dt><dd>{stats.activeDebtMovements}</dd></div><div><dt>Última compra</dt><dd>{stats.lastPurchaseAt ? formatDateTime(stats.lastPurchaseAt) : '—'}</dd></div><div><dt>Último pago</dt><dd>{stats.lastPaymentAt ? formatDateTime(stats.lastPaymentAt) : 'Todavía no hay pagos'}</dd></div><div><dt>Total apuntado</dt><dd>{formatCents(stats.totalChargedActive)}</dd></div><div><dt>Total pagado</dt><dd>{formatCents(stats.totalPaidActive)}</dd></div><div><dt>Movimientos registrados</dt><dd>{stats.movementCount}</dd></div></dl><p className="muted summary-note">Los totales no cuentan movimientos anulados. El saldo anterior cuenta como apuntado. La última compra no incluye el saldo anterior.</p></section>}<div className="section-heading"><h2>Movimientos</h2></div>{error && <p className="error">{error}</p>}{data?.tickets.filter((ticket) => ticket.status === 'active').map((ticket) => <button className="movement" key={ticket.id} onClick={() => onTicket(ticket)}><span><b>{movementHeadline(ticket)}</b><small>{movementDetail(ticket)}</small></span><strong className="debt">+ {formatCents(ticket.amount_cents)}</strong></button>)}{data?.payments.filter((payment) => !payment.voided_at).map((payment) => <PaymentRow key={payment.id} user={user} payment={payment} onChanged={() => void loadClientHistory(user, client.id).then(setData)} />)}{data && data.tickets.length === 0 && data.payments.length === 0 && <p className="empty">Todavía no hay movimientos.</p>}{!data && <p className="muted">Cargando movimientos...</p>}</FormPage>
}

function OpeningBalance({ user, client, photoUrl, onBack, onSaved }: { user: User; client: Client | ClientSummary; photoUrl?: string; onBack: () => void; onSaved: (addedCents: number) => void | Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const cents = parseEuroToCents(amount)
    if (cents === null) { setError('Introduce un importe válido, por ejemplo 86,40.'); return }
    if (!window.confirm(openingBalanceConfirmation(client.name, cents))) return
    setBusy(true)
    setError('')
    try {
      await createOpeningBalance(user, client.id, cents, note)
      await onSaved(cents)
    } catch (cause) {
      setError(isDuplicateOpeningBalance(cause)
        ? 'Este cliente ya tiene un saldo anterior registrado. Anúlalo antes de registrar otro.'
        : 'No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.')
      setBusy(false)
    }
  }

  return <FormPage title="Añadir saldo anterior" onBack={onBack}><div className="selected"><Avatar name={client.name} photoUrl={photoUrl} /><strong>{client.name}</strong></div><p className="muted">Para apuntar lo que este cliente ya debía antes de empezar a usar La Libreta.</p><form onSubmit={submit}><label>Importe que ya debía<input autoFocus inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Nota <span className="muted">(opcional)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tickets de papel hasta agosto" maxLength={160} /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : 'Añadir saldo anterior'}</button></form></FormPage>
}

function PaymentRow({ user, payment, onChanged }: { user: User; payment: Payment; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  async function cancel() {
    if (busy) return
    const reason = window.prompt('Motivo de anulación del pago')?.trim()
    if (!reason || !window.confirm('¿Anular este pago? Se conservará en el historial.')) return
    setBusy(true)
    try {
      await voidMovement(user, 'payments', payment.id, reason)
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  return <div className="movement payment"><span><b>{formatDateTime(payment.created_at)}</b><small>Pago recibido</small></span><strong className="paid">- {formatCents(payment.amount_cents)}</strong><button className="icon-button" disabled={busy} onClick={() => void cancel()} aria-label="Anular pago" title="Anular pago">×</button></div>
}

function TicketPage({ user, ticket, onBack, onChanged }: { user: User; ticket: Ticket; onBack: () => void; onChanged: () => void }) {
  const [photoUrl, setPhotoUrl] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (ticket.photo_path) void signedPhotoUrl(ticket.photo_path).then(setPhotoUrl).catch(() => setError('No se pudo cargar la foto.')) }, [ticket.photo_path])

  async function cancel() {
    if (!reason.trim() || busy || !window.confirm('¿Anular este ticket? Se conservará en el historial.')) return
    setBusy(true)
    try {
      await voidMovement(user, 'tickets', ticket.id, reason)
      onChanged()
    } catch {
      setError('No se pudo anular el ticket.')
    } finally {
      setBusy(false)
    }
  }

  return <FormPage title={isOpeningBalance(ticket) ? 'Detalle del saldo anterior' : 'Detalle del ticket'} onBack={onBack}><div className="detail"><span className="label">{isOpeningBalance(ticket) ? 'Saldo anterior' : 'Compra'} · {formatDateTime(ticket.created_at)} · {ticket.status === 'voided' ? 'Anulado' : 'Activo'}</span><strong>{formatCents(ticket.amount_cents)}</strong><p>{ticket.concept || (isOpeningBalance(ticket) ? 'Deuda anterior a La Libreta' : 'Sin concepto')}</p>{photoUrl && <img className="ticket-photo" src={photoUrl} alt="Foto del ticket" />}</div>{ticket.status === 'active' && <><label>Motivo de anulación<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Necesario para anular" /></label><p className="field-hint">Anular no borra el movimiento: queda en el historial y deja de contar en la deuda.</p>{error && <p className="error">{error}</p>}<button className="danger-action" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? 'Anulando...' : 'Anular ticket'}</button></>}</FormPage>
}

function Charge({ user, client, onBack, onPaid }: { user: User; client: Client | ClientSummary; onBack: () => void; onPaid: (paidCents: number) => void | Promise<void> }) {
  const [balance, setBalance] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void loadClientHistory(user, client.id).then((data) => { setBalance(data.balance); setLoaded(true) }).catch(() => setError('No se pudo cargar la deuda.')) }, [user, client.id])

  async function pay(value: number) {
    if (busy) return
    if (!canRegisterPayment(balance, value)) { setError('El importe debe ser mayor que cero y no superar la deuda.'); return }
    setBusy(true)
    setError('')
    try {
      await createPayment(user, client.id, value)
      await onPaid(value)
    } catch {
      setError('No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  return <FormPage title="Cobrar" onBack={onBack}><div className="balance-card"><span className="label">Deuda de {client.name}</span><strong>{loaded ? formatCents(balance) : '...'}</strong></div>{!loaded && !error && <p className="muted">Cargando la deuda...</p>}{loaded && !canChargeClient(balance) && <p className="empty">Este cliente no debe nada. No hay nada que cobrar.</p>}{loaded && canChargeClient(balance) && <><div className="actions"><button disabled={busy} onClick={() => void pay(balance)}>Paga todo</button><button className="secondary-action" disabled={busy} onClick={() => void pay(parseEuroToCents(amount) ?? 0)}>Paga una parte</button></div><label>Importe parcial<input inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label></>}{error && <p className="error">{error}</p>}</FormPage>
}

/**
 * Identidad del cliente en pantallas que son suyas pero no se titulan con su nombre.
 * El nombre sale del cliente seleccionado, nunca de estado propio que pueda desincronizarse.
 */
function ClientIdentity({ name, photoUrl, balance }: { name: string; photoUrl?: string; balance: number | null }) {
  return <section className="client-identity"><Avatar name={name} photoUrl={photoUrl} /><div><strong className="client-identity-name">{name}</strong><span>{balance === null ? 'Cargando saldo...' : balance > 0 ? `Deuda actual: ${formatCents(balance)}` : 'No debe nada'}</span></div></section>
}

function History({ user, client, photoUrl, onBack, onTicket }: { user: User; client: Client | ClientSummary; photoUrl?: string; onBack: () => void; onTicket: (ticket: Ticket) => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  useEffect(() => { void loadClientHistory(user, client.id).then(setData) }, [user, client.id])
  const movements = movementsForDisplay(data?.tickets ?? [], data?.payments ?? [])
  const balance = data?.balance ?? ('balance' in client ? client.balance : null)
  return <FormPage title="Historial" onBack={onBack}><ClientIdentity name={client.name} photoUrl={photoUrl} balance={balance} /><MovementList movements={movements} onTicket={onTicket} /></FormPage>
}

function AccountView({ user, client, photoUrl, onBack, onTicket }: { user: User; client: Client | ClientSummary; photoUrl?: string; onBack: () => void; onTicket: (ticket: Ticket) => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  useEffect(() => { void loadClientHistory(user, client.id).then(setData) }, [user, client.id])
  const movements = movementsForDisplay(data?.tickets.filter((ticket) => ticket.status === 'active') ?? [], data?.payments.filter((payment) => !payment.voided_at) ?? [])
  // Todas las cifras salen del modelo unico de `Ver cuenta`, el mismo que se
  // reutilizara para email, PDF o WhatsApp. La lista de arriba solo sirve para
  // poder abrir un movimiento concreto.
  const account = data ? buildAccountView(client, data.tickets, data.payments, new Date()) : null
  const balance = account?.balanceCents ?? ('balance' in client ? client.balance : 0)
  return <FormPage title="Ver cuenta" onBack={onBack}><section className="account-summary"><div className="account-who"><Avatar name={client.name} photoUrl={photoUrl} /><strong className="client-identity-name">{client.name}</strong></div><strong>{formatCents(balance)}</strong><p>{balance > 0 ? 'Total pendiente' : 'No debe nada'}</p>{account && account.ageInDays !== null && balance > 0 && <p className="account-age">{agingSentence(account.ageInDays, account.ageApproximate)}</p>}{account?.clientEmail && <p className="account-email-line">{account.clientEmail}</p>}</section>{account && <ShareMenu summary={buildAccountSummary({ clientName: client.name }, data?.tickets ?? [], data?.payments ?? [], new Date())} clientId={client.id} clientEmail={client.email ?? null} clientPhone={client.phone} onAddEmail={onBack} />}{account && <dl className="summary-grid account-totals"><div><dt>Total apuntado</dt><dd>{formatCents(account.totalChargedCents)}</dd></div><div><dt>Total pagado</dt><dd>{formatCents(account.totalPaidCents)}</dd></div></dl>}<MovementList movements={movements} onTicket={onTicket} empty="Todavía no hay movimientos pendientes." /></FormPage>
}

function movementsForDisplay(tickets: Ticket[], payments: Payment[]): DisplayMovement[] {
  return [...tickets.map((item) => ({ ...item, kind: 'ticket' as const })), ...payments.map((item) => ({ ...item, kind: 'payment' as const }))].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function MovementList({ movements, onTicket, empty = 'Todavía no hay movimientos.' }: { movements: DisplayMovement[]; onTicket: (ticket: Ticket) => void; empty?: string }) {
  return <div className="history-list">{movements.map((movement) => movement.kind === 'ticket' ? <button className="movement" key={movement.id} onClick={() => onTicket(movement)}><span><b>{movementHeadline(movement)}</b><small>{movementDetail(movement, { withStatus: true })}</small></span><strong className={movement.status === 'voided' ? 'muted' : 'debt'}>{formatCents(movement.amount_cents)}</strong></button> : <div className="movement payment" key={movement.id}><span><b>{formatDateTime(movement.created_at)}</b><small>Pago · {movement.voided_at ? 'Anulado' : 'Activo'}</small></span><strong className={movement.voided_at ? 'muted' : 'paid'}>- {formatCents(movement.amount_cents)}</strong></div>)}{movements.length === 0 && <p className="empty">{empty}</p>}</div>
}

function Settings({ user, onBack }: { user: User; onBack: () => void }) {
  const [stage, setStage] = useState<'idle' | 'reauth' | 'change'>('idle')
  const [recovering, setRecovering] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repeatedPassword, setRepeatedPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Las contrasenas viven solo en el estado del formulario y se limpian al cambiar de paso.
  function goToStage(next: 'idle' | 'reauth' | 'change') {
    setCurrentPassword('')
    setPassword('')
    setRepeatedPassword('')
    setError('')
    setStage(next)
  }

  async function confirmIdentity(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email ?? '', password: currentPassword })
    if (authError) setError('La contraseña actual no es correcta.')
    else goToStage('change')
    setBusy(false)
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const problem = passwordProblem(password, repeatedPassword)
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    // Solo se anuncia exito cuando Supabase confirma el cambio.
    if (updateError) setError('No se pudo cambiar la contraseña. Vuelve a intentarlo.')
    else { goToStage('idle'); setMessage('✓ Contraseña actualizada') }
    setBusy(false)
  }

  if (recovering) return <FormPage title="Recuperar contraseña" onBack={() => setRecovering(false)}><p className="muted">Te enviamos un enlace a tu email para crear una contraseña nueva.</p><ForgotPasswordForm initialEmail={user.email ?? ''} /></FormPage>

  return <FormPage title="Cuenta" onBack={onBack}><section className="account-field"><span className="label">Email de acceso</span><strong className="account-email">{user.email}</strong></section>{message && <p className="notice success" role="status">{message}</p>}{stage === 'idle' && <button type="button" className="secondary-action subtle-action account-action" onClick={() => { setMessage(''); goToStage('reauth') }}>Cambiar contraseña</button>}{stage === 'reauth' && <form onSubmit={confirmIdentity}><p className="muted">Por seguridad, confirma tu contraseña actual antes de cambiarla.</p><label>Contraseña actual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy || currentPassword.length === 0}>{busy ? 'Comprobando...' : 'Continuar'}</button><button type="button" className="text-button" onClick={() => setRecovering(true)}>He olvidado mi contraseña</button><button type="button" className="text-button" onClick={() => goToStage('idle')}>Cancelar</button></form>}{stage === 'change' && <form onSubmit={savePassword}><label>Nueva contraseña<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>Repetir nueva contraseña<input type="password" autoComplete="new-password" value={repeatedPassword} onChange={(event) => setRepeatedPassword(event.target.value)} required /></label><p className="muted">Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.</p>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : 'Guardar nueva contraseña'}</button><button type="button" className="text-button" onClick={() => goToStage('idle')}>Cancelar</button></form>}<button type="button" className="danger-action account-logout" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></FormPage>
}

function FormPage({ title, onBack, action, leading, children }: { title: string; onBack: () => void; action?: React.ReactNode; leading?: React.ReactNode; children: React.ReactNode }) {
  return <section className="page"><button className="back" onClick={onBack}>← Volver</button>{action || leading ? <div className="page-heading">{leading}<h1>{title}</h1>{action}</div> : <h1>{title}</h1>}{children}</section>
}

/** Un saldo anterior no es una compra hecha ese dia: se titula por lo que es. */
function movementHeadline(ticket: Ticket): string {
  return isOpeningBalance(ticket) ? 'Saldo anterior' : formatDateTime(ticket.created_at)
}

function movementDetail(ticket: Ticket, options: { withStatus?: boolean } = {}): string {
  const parts = [isOpeningBalance(ticket) ? `Registrado el ${formatDateTime(ticket.created_at)}` : 'Compra']
  if (options.withStatus) parts.push(ticket.status === 'voided' ? 'Anulado' : 'Activo')
  if (ticket.concept) parts.push(ticket.concept)
  if (ticket.photo_path) parts.push('Foto')
  return parts.join(' · ')
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
