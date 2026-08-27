import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
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
  signedPhotoUrl,
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
import { accountDisplayName, accountInitial, MIN_PASSWORD_LENGTH, passwordProblem } from './lib/account'

type View = 'home' | 'new-client' | 'choose-client' | 'purchase' | 'client' | 'ticket' | 'charge' | 'opening-balance' | 'history' | 'account' | 'settings'
type Notice = { tone: 'success' | 'error'; title?: string; message: string }
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

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forgotPassword, setForgotPassword] = useState(false)

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
  return <main className="shell"><section className="panel login"><p className="eyebrow">La Libreta de Marcos</p><h1>Tu tienda, en orden.</h1><p className="muted">Accede para gestionar tus compras fiadas.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Entrando...' : 'Iniciar sesión'}</button><button type="button" className="text-button forgot-link" onClick={() => setForgotPassword(true)}>¿Has olvidado tu contraseña?</button></form></section></main>
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

  async function refresh(options: { keepNotice?: boolean } = {}) {
    setRefreshing(true)
    try {
      const dashboard = await loadDashboard(user)
      setClients(dashboard.clients)
      setTotal(dashboard.total)
      setSupportsOpeningBalance(dashboard.supportsOpeningBalance)
      setDisplayName(dashboard.displayName)
      if (!options.keepNotice) setNotice(null)
    } catch {
      setNotice({ tone: 'error', message: 'No se pudieron cargar los datos. Comprueba la conexión y vuelve a intentarlo.' })
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  function openClient(client: Client | ClientSummary) {
    setSelectedClient(client)
    setView('client')
  }

  function openNewClient(origin: 'home' | 'client') {
    setNewClientOrigin(origin)
    setView('new-client')
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

  if (refreshing && clients.length === 0) return <main className="shell"><p>Cargando tu libreta...</p></main>
  return <main className="app-shell"><header className="topbar"><div className="topbar-row"><button className="brand-button" onClick={() => setView('home')}><span className="eyebrow">La Libreta de Marcos</span></button><UserMenu name={accountDisplayName(displayName, user.email)} onAccount={() => setView('settings')} onSignOut={() => void supabase.auth.signOut()} /></div><span className="brand-place">Covirán · San Miguel de las Dueñas · El Bierzo · León</span></header><div className="content">{notice && <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.title && <strong>{notice.title}</strong>}<span>{notice.message}</span></div>}{view === 'home' && <Home clients={clients} total={total} busy={refreshing} onClient={openClient} onNew={() => openNewClient('home')} onBuy={() => setView('choose-client')} />}{view === 'new-client' && <NewClient user={user} allowContinue={newClientOrigin !== 'client'} onBack={() => setView(newClientOrigin === 'client' && selectedClient ? 'client' : 'home')} onCreated={(client, continuePurchase) => { setSelectedClient(client); setNotice({ tone: 'success', title: `✓ ${client.name} creado correctamente`, message: 'Ya está en tu libreta.' }); void refresh({ keepNotice: true }); setView(continuePurchase ? 'purchase' : 'client') }} />}{view === 'choose-client' && <ChooseClient clients={clients} onBack={() => setView('home')} onClient={(client) => { setSelectedClient(client); setView('purchase') }} onNew={() => openNewClient('home')} />}{view === 'purchase' && selectedClient && <Purchase user={user} client={selectedClient} onBack={() => setView('choose-client')} onSaved={(ticket) => finishPurchase(ticket, selectedClient)} />}{view === 'client' && selectedClient && <ClientPage user={user} client={selectedClient} canAddOpeningBalance={supportsOpeningBalance} onBack={() => setView('home')} onBuy={() => setView('purchase')} onCharge={() => setView('charge')} onNewClient={() => openNewClient('client')} onOpeningBalance={() => setView('opening-balance')} onTicket={(ticket) => { setSelectedTicket(ticket); setView('ticket') }} onHistory={() => setView('history')} onAccount={() => setView('account')} />}{view === 'opening-balance' && selectedClient && <OpeningBalance user={user} client={selectedClient} onBack={() => setView('client')} onSaved={(addedCents) => finishOpeningBalance(selectedClient, addedCents)} />}{view === 'ticket' && selectedTicket && <TicketPage user={user} ticket={selectedTicket} onBack={() => setView('client')} onChanged={() => { void refresh({ keepNotice: Boolean(notice) }); setView('client') }} />}{view === 'charge' && selectedClient && <Charge user={user} client={selectedClient} onBack={() => setView('client')} onPaid={(paidCents) => finishPayment(selectedClient, paidCents)} />}{view === 'history' && selectedClient && <History user={user} client={selectedClient} onBack={() => setView('client')} onTicket={(ticket) => { setSelectedTicket(ticket); setView('ticket') }} />}{view === 'account' && selectedClient && <AccountView user={user} client={selectedClient} onBack={() => setView('client')} onTicket={(ticket) => { setSelectedTicket(ticket); setView('ticket') }} />}{view === 'settings' && <Settings user={user} onBack={() => setView('home')} />}</div></main>
}

/**
 * Control unico de usuario de la cabecera. Sustituye a los enlaces sueltos
 * `Cuenta` y `Salir`, que daban demasiado protagonismo al cierre de sesion.
 * Menu propio en lugar de libreria: son dos opciones.
 */
function UserMenu({ name, onAccount, onSignOut }: { name: string; onAccount: () => void; onSignOut: () => void }) {
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
      <button type="button" role="menuitem" className="user-option" onClick={() => choose(onAccount)}>Cuenta</button>
      <button type="button" role="menuitem" className="user-option user-option-danger" onClick={() => choose(onSignOut)}>Cerrar sesión</button>
    </div>}
  </div>
}

function Home({ clients, total, busy, onClient, onNew, onBuy }: { clients: ClientSummary[]; total: number; busy: boolean; onClient: (client: ClientSummary) => void; onNew: () => void; onBuy: () => void }) {
  const [query, setQuery] = useState('')
  const visible = searchClients(sortClientsForHome(clients), query)
  return <><section className="hero"><div><span className="label">Pendiente de cobrar</span><strong>{formatCents(total)}</strong></div><button className="primary-action" onClick={onBuy}>+ Apuntar compra</button></section><div className="section-heading home-heading"><h2>Clientes</h2><button className="secondary-action small-action" onClick={onNew}>Nuevo cliente</button></div><input className="search" placeholder="Buscar por nombre o apodo" value={query} onChange={(event) => setQuery(event.target.value)} />{busy ? <p className="muted">Actualizando...</p> : <div className="client-list">{visible.map((client) => <ClientRow client={client} key={client.id} onClick={() => onClient(client)} />)}{clients.length === 0 && <div className="empty"><strong>Todavía no tienes clientes.</strong><span>Crea el primero o apunta una compra.</span></div>}{clients.length > 0 && visible.length === 0 && <p className="empty">No hay clientes que coincidan.</p>}</div>}</>
}

function ClientRow({ client, onClick }: { client: ClientSummary; onClick: () => void }) {
  return <button className="client-row" onClick={onClick}><span className="avatar">{client.name.charAt(0).toUpperCase()}</span><span className="client-name"><strong>{client.name}</strong>{client.nickname && <small>{client.nickname}</small>}</span><strong className={client.balance > 0 ? 'debt' : 'paid'}>{formatCents(client.balance)}</strong></button>
}

function NewClient({ user, onBack, onCreated, allowContinue = true }: { user: User; onBack: () => void; onCreated: (client: Client, continuePurchase: boolean) => void; allowContinue?: boolean }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [continuePurchase, setContinuePurchase] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onCreated(await createClient(user, { name, phone, nickname, note }), allowContinue && continuePurchase)
    } catch {
      setError('No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.')
    } finally {
      setBusy(false)
    }
  }

  return <FormPage title="Nuevo cliente" onBack={onBack}><form onSubmit={submit}><label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Apodo o referencia <span className="muted">(opcional)</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Pepe el de la plaza" maxLength={80} /></label><label>Teléfono <span className="muted">(opcional)</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Nota corta <span className="muted">(opcional)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Madre de Lucía" maxLength={160} /></label>{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : allowContinue && continuePurchase ? 'Crear y continuar' : 'Crear cliente'}</button>{allowContinue && <label className="check"><input type="checkbox" checked={continuePurchase} onChange={(event) => setContinuePurchase(event.target.checked)} /> Crear y continuar con una compra</label>}</form></FormPage>
}

function ChooseClient({ clients, onBack, onClient, onNew }: { clients: ClientSummary[]; onBack: () => void; onClient: (client: ClientSummary) => void; onNew: () => void }) {
  const [query, setQuery] = useState('')
  const hasQuery = query.trim().length > 0
  const ordered = sortClientsForHome(clients)
  const visible = searchClients(ordered, query)
  const recents = recentClients(clients, 4)
  const visibleWithoutRecents = hasQuery ? visible : visible.filter((client) => !recents.some((recent) => recent.id === client.id))
  return <FormPage title="¿A quién se lo apuntamos?" onBack={onBack}><input autoFocus className="search" placeholder="Buscar cliente" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="secondary-action create-before-list" onClick={onNew}>+ Nuevo cliente</button>{!hasQuery && recents.length > 0 && <section className="compact-section"><h2>Recientes</h2><div className="client-list">{recents.map((client) => <ClientRow client={client} key={client.id} onClick={() => onClient(client)} />)}</div></section>}<section className="compact-section"><h2>{hasQuery ? 'Resultados' : 'Todos'}</h2><div className="client-list">{visibleWithoutRecents.map((client) => <ClientRow client={client} key={client.id} onClick={() => onClient(client)} />)}{clients.length === 0 && <div className="empty"><strong>Todavía no tienes clientes.</strong><span>Crea el primero y continúa con la compra.</span></div>}{clients.length > 0 && visible.length === 0 && <p className="empty">No hay clientes que coincidan.</p>}</div></section></FormPage>
}

function Purchase({ user, client, onBack, onSaved }: { user: User; client: Client | ClientSummary; onBack: () => void; onSaved: (ticket: Ticket) => void | Promise<void> }) {
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

  return <FormPage title="Nueva compra" onBack={onBack}><div className="selected"><span className="avatar">{client.name.charAt(0)}</span><strong>{client.name}</strong></div><form onSubmit={submit}><label>Importe<input inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={Boolean(existingTicket)} /></label><label>Concepto <span className="muted">(opcional)</span><input value={concept} onChange={(event) => setConcept(event.target.value)} disabled={Boolean(existingTicket)} /></label><div className="photo-input"><span className="label">Foto del ticket <span className="muted">(opcional)</span></span><input id={photoInputId} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /><label className="photo-button" htmlFor={photoInputId}>Hacer foto del ticket</label>{photo && <button type="button" className="text-button" onClick={() => setPhoto(null)}>Quitar foto</button>}</div>{photo && <div className="photo-preview"><img src={previewUrl} alt="Vista previa de la foto del ticket" /><span>{photo.name}</span></div>}{error && <p className="error">{error}</p>}{existingTicket ? <button type="button" disabled={busy || !photo} onClick={() => void retryPhoto()}>{busy ? 'Reintentando...' : 'Reintentar foto'}</button> : <button disabled={busy}>{busy ? 'Guardando...' : 'Guardar compra'}</button>}</form></FormPage>
}

function ClientPage({ user, client, canAddOpeningBalance, onBack, onBuy, onCharge, onNewClient, onOpeningBalance, onTicket, onHistory, onAccount }: { user: User; client: Client | ClientSummary; canAddOpeningBalance: boolean; onBack: () => void; onBuy: () => void; onCharge: () => void; onNewClient: () => void; onOpeningBalance: () => void; onTicket: (ticket: Ticket) => void; onHistory: () => void; onAccount: () => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { void loadClientHistory(user, client.id).then(setData).catch(() => setError('No se pudo cargar la ficha. Comprueba la conexión.')) }, [user, client.id])

  const balance = data?.balance ?? ('balance' in client ? client.balance : 0)
  return <FormPage title={client.name} onBack={onBack}><div className="balance-card"><span className="label">{balance > 0 ? 'Deuda actual' : 'Estado'}</span><strong>{balance > 0 ? formatCents(balance) : 'No debe nada'}</strong>{client.note && <p>{client.note}</p>}</div><div className="actions"><button className="primary-action" onClick={onBuy}>+ Nueva compra</button>{canChargeClient(balance) && <button className="secondary-action" onClick={onCharge}>Cobrar {formatCents(balance)}</button>}</div><div className="secondary-actions"><button className="secondary-action subtle-action" onClick={onHistory}>Ver historial</button><button className="secondary-action subtle-action" onClick={onAccount}>Ver cuenta</button>{canAddOpeningBalance && data && !hasActiveOpeningBalance(data.tickets) && <button className="secondary-action subtle-action" onClick={onOpeningBalance}>Añadir saldo anterior</button>}</div><div className="other-client"><button className="secondary-action other-client-action" onClick={onNewClient}>+ Crear otro cliente</button></div><div className="section-heading"><h2>Movimientos</h2></div>{error && <p className="error">{error}</p>}{data?.tickets.filter((ticket) => ticket.status === 'active').map((ticket) => <button className="movement" key={ticket.id} onClick={() => onTicket(ticket)}><span><b>{movementHeadline(ticket)}</b><small>{movementDetail(ticket)}</small></span><strong className="debt">+ {formatCents(ticket.amount_cents)}</strong></button>)}{data?.payments.filter((payment) => !payment.voided_at).map((payment) => <PaymentRow key={payment.id} user={user} payment={payment} onChanged={() => void loadClientHistory(user, client.id).then(setData)} />)}{data && data.tickets.length === 0 && data.payments.length === 0 && <p className="empty">Todavía no hay movimientos.</p>}{!data && <p className="muted">Cargando movimientos...</p>}</FormPage>
}

function OpeningBalance({ user, client, onBack, onSaved }: { user: User; client: Client | ClientSummary; onBack: () => void; onSaved: (addedCents: number) => void | Promise<void> }) {
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

  return <FormPage title="Añadir saldo anterior" onBack={onBack}><div className="selected"><span className="avatar">{client.name.charAt(0)}</span><strong>{client.name}</strong></div><p className="muted">Para apuntar lo que este cliente ya debía antes de empezar a usar La Libreta.</p><form onSubmit={submit}><label>Importe que ya debía<input autoFocus inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Nota <span className="muted">(opcional)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tickets de papel hasta agosto" maxLength={160} /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Guardando...' : 'Añadir saldo anterior'}</button></form></FormPage>
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

  return <FormPage title={isOpeningBalance(ticket) ? 'Detalle del saldo anterior' : 'Detalle del ticket'} onBack={onBack}><div className="detail"><span className="label">{isOpeningBalance(ticket) ? 'Saldo anterior' : 'Compra'} · {formatDateTime(ticket.created_at)} · {ticket.status === 'voided' ? 'Anulado' : 'Activo'}</span><strong>{formatCents(ticket.amount_cents)}</strong><p>{ticket.concept || (isOpeningBalance(ticket) ? 'Deuda anterior a La Libreta' : 'Sin concepto')}</p>{photoUrl && <img className="ticket-photo" src={photoUrl} alt="Foto del ticket" />}</div>{ticket.status === 'active' && <><label>Motivo de anulación<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Necesario para anular" /></label>{error && <p className="error">{error}</p>}<button className="danger-action" disabled={busy || !reason.trim()} onClick={() => void cancel()}>{busy ? 'Anulando...' : 'Anular ticket'}</button></>}</FormPage>
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
function ClientIdentity({ name, balance }: { name: string; balance: number | null }) {
  return <section className="client-identity"><strong className="client-identity-name">{name}</strong><span>{balance === null ? 'Cargando saldo...' : balance > 0 ? `Deuda actual: ${formatCents(balance)}` : 'No debe nada'}</span></section>
}

function History({ user, client, onBack, onTicket }: { user: User; client: Client | ClientSummary; onBack: () => void; onTicket: (ticket: Ticket) => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  useEffect(() => { void loadClientHistory(user, client.id).then(setData) }, [user, client.id])
  const movements = movementsForDisplay(data?.tickets ?? [], data?.payments ?? [])
  const balance = data?.balance ?? ('balance' in client ? client.balance : null)
  return <FormPage title="Historial" onBack={onBack}><ClientIdentity name={client.name} balance={balance} /><MovementList movements={movements} onTicket={onTicket} /></FormPage>
}

function AccountView({ user, client, onBack, onTicket }: { user: User; client: Client | ClientSummary; onBack: () => void; onTicket: (ticket: Ticket) => void }) {
  const [data, setData] = useState<{ tickets: Ticket[]; payments: Payment[]; balance: number } | null>(null)
  useEffect(() => { void loadClientHistory(user, client.id).then(setData) }, [user, client.id])
  const movements = movementsForDisplay(data?.tickets.filter((ticket) => ticket.status === 'active') ?? [], data?.payments.filter((payment) => !payment.voided_at) ?? [])
  const balance = data?.balance ?? ('balance' in client ? client.balance : 0)
  return <FormPage title="Ver cuenta" onBack={onBack}><section className="account-summary"><strong className="client-identity-name">{client.name}</strong><strong>{formatCents(balance)}</strong><p>{balance > 0 ? 'Total pendiente' : 'No debe nada'}</p></section><MovementList movements={movements} onTicket={onTicket} empty="Todavía no hay movimientos pendientes." /></FormPage>
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

function FormPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <section className="page"><button className="back" onClick={onBack}>← Volver</button><h1>{title}</h1>{children}</section>
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
