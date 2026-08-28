import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { calculateActiveBalance } from './money'
import { AVATAR_MIME, shrinkImageFile } from './image'

/** Las fotos de cliente viven en el bucket privado existente, bajo prefijo propio. */
export const PHOTO_BUCKET = 'ticket-photos'
export const CLIENT_PHOTO_PREFIX = 'client-photos'
/** Las signed URL de avatar duran una hora y se renuevan en cada carga del panel. */
export const PHOTO_URL_TTL_SECONDS = 3600

export type Client = { id: string; store_id: string; name: string; phone: string | null; nickname: string | null; note: string | null; email?: string | null; photo_path?: string | null; active: boolean; created_at?: string; updated_at?: string }
/** `opening_balance` = deuda anterior a La Libreta, migrada desde los tickets de papel. */
export type MovementOrigin = 'purchase' | 'opening_balance'
// `origin` es opcional porque las filas leidas antes de aplicar la migracion 202608270003 no lo traen.
export type Ticket = { id: string; store_id: string; client_id: string; amount_cents: number; concept: string | null; photo_path: string | null; status: 'active' | 'voided'; origin?: MovementOrigin; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type Payment = { id: string; store_id: string; client_id: string; amount_cents: number; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type ClientSummary = Client & { balance: number; lastActivityAt: string | null }
export type ClientInput = { name: string; phone: string; nickname?: string; note?: string; email?: string | null }

export function isOpeningBalance(ticket: Pick<Ticket, 'origin'>): boolean {
  return ticket.origin === 'opening_balance'
}

/** Violacion del indice unico de saldo anterior vivo (un unico saldo anterior por cliente). */
export function isDuplicateOpeningBalance(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: string }).code === '23505'
}

export function hasActiveOpeningBalance(tickets: Ticket[]): boolean {
  return tickets.some((ticket) => isOpeningBalance(ticket) && ticket.status === 'active')
}

export function summarizeClients(clients: Client[], tickets: Ticket[], payments: Payment[]): ClientSummary[] {
  // Se agrupa una vez en lugar de recorrer los dos arrays completos por cliente:
  // con cientos de clientes eso era coste cuadratico por nada.
  const ticketsByClient = groupByClient(tickets)
  const paymentsByClient = groupByClient(payments)
  return clients.map((client) => {
    const propios = ticketsByClient.get(client.id) ?? []
    const pagos = paymentsByClient.get(client.id) ?? []
    const fechas = [...propios.map((t) => t.created_at), ...pagos.map((p) => p.created_at)]
    return {
      ...client,
      balance: calculateActiveBalance(propios, pagos),
      lastActivityAt: fechas.sort((a, b) => b.localeCompare(a))[0] ?? null,
    }
  })
}

function groupByClient<T extends { client_id: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const lista = map.get(item.client_id)
    if (lista) lista.push(item)
    else map.set(item.client_id, [item])
  }
  return map
}


async function currentProfile(user: User): Promise<{ store_id: string; display_name: string | null }> {
  const { data, error } = await supabase.from('profiles').select('store_id, display_name').eq('id', user.id).single()
  if (error) throw error
  return data
}

async function currentStore(user: User): Promise<string> {
  return (await currentProfile(user)).store_id
}

function photoExtension(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/** Signed URLs temporales por ruta. Nunca se expone una URL publica permanente. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL_SECONDS)
  if (error || !data) return {}
  const urls: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
  }
  return urls
}

/**
 * Sube la foto del cliente ya reducida y deja la referencia en `clients.photo_path`.
 * La imagen no entra en la base de datos: solo su ruta en Storage privado.
 */
export async function attachClientPhoto(user: User, client: Client, file: File): Promise<Client> {
  const storeId = await currentStore(user)
  const image = await shrinkImageFile(file)
  const contentType = image.type || AVATAR_MIME
  const path = `${storeId}/${CLIENT_PHOTO_PREFIX}/${client.id}/${crypto.randomUUID()}.${photoExtension(contentType)}`
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, image, { contentType, upsert: false })
  if (uploadError) throw uploadError
  const { data, error } = await supabase.from('clients').update({ photo_path: path }).eq('id', client.id).eq('store_id', storeId).select().single()
  if (error) throw error
  await discardPhotoObject(client.photo_path)
  return data as Client
}

export type SendSummaryResult = { ok: true; recipient: string } | { ok: false; code: string; message: string }

/**
 * Pide a la Edge Function que envie el resumen. El navegador manda SOLO el id
 * del cliente: el destinatario, el saldo y los movimientos los resuelve el
 * servidor desde la base de datos. Nada de lo que se calcula aqui viaja como
 * verdad.
 */
export async function sendAccountSummaryEmail(clientId: string): Promise<SendSummaryResult> {
  const { data, error } = await supabase.functions.invoke('send-account-summary', { body: { client_id: clientId } })
  if (error) {
    // Un error HTTP trae el cuerpo dentro del contexto; de ahi sale el mensaje
    // que entiende una persona, en vez de un codigo de estado.
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json()
        if (body && typeof body.message === 'string') return { ok: false, code: String(body.code ?? 'send_failed'), message: body.message }
      } catch {
        // cuerpo no legible: se cae al mensaje generico
      }
    }
    return { ok: false, code: 'send_failed', message: 'No se pudo enviar el resumen. Inténtalo de nuevo.' }
  }
  if (data && data.ok === true && typeof data.recipient === 'string') return { ok: true, recipient: data.recipient }
  if (data && typeof data.message === 'string') return { ok: false, code: String(data.code ?? 'send_failed'), message: data.message }
  return { ok: false, code: 'send_failed', message: 'No se pudo enviar el resumen. Inténtalo de nuevo.' }
}

/** El email es opcional y editable: pasar null lo deja sin email. */
export async function updateClientEmail(user: User, client: Client, email: string | null): Promise<Client> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('clients').update({ email }).eq('id', client.id).eq('store_id', storeId).select().single()
  if (error) throw error
  return data as Client
}

/** Quitar la foto no borra al cliente ni su historial: solo suelta la referencia. */
export async function removeClientPhoto(user: User, client: Client): Promise<Client> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('clients').update({ photo_path: null }).eq('id', client.id).eq('store_id', storeId).select().single()
  if (error) throw error
  await discardPhotoObject(client.photo_path)
  return data as Client
}

// Limpieza best-effort: si falla, el objeto queda huerfano pero ya no lo referencia
// nadie, y no tiene sentido dar por fallida una operacion que si se completo.
async function discardPhotoObject(path: string | null | undefined): Promise<void> {
  if (!path) return
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
  } catch {
    // ignorado a proposito
  }
}

export async function loadDashboard(user: User): Promise<{ clients: ClientSummary[]; total: number; tickets: Ticket[]; payments: Payment[]; supportsOpeningBalance: boolean; supportsClientPhoto: boolean; photoUrls: Record<string, string>; displayName: string | null }> {
  const profile = await currentProfile(user)
  const storeId = profile.store_id
  const [{ data: clients, error: clientsError }, { data: tickets, error: ticketsError }, { data: payments, error: paymentsError }, originProbe, photoProbe] = await Promise.all([
    supabase.from('clients').select('*').eq('store_id', storeId).eq('active', true).order('name'),
    supabase.from('tickets').select('*').eq('store_id', storeId).eq('status', 'active'),
    supabase.from('payments').select('*').eq('store_id', storeId).is('voided_at', null),
    // Sondas de esquema: si la migracion correspondiente aun no esta aplicada la
    // columna no existe, y la funcionalidad no se ofrece en vez de fallar al guardar.
    supabase.from('tickets').select('origin').limit(1),
    supabase.from('clients').select('photo_path').limit(1),
  ])
  if (clientsError || ticketsError || paymentsError) throw clientsError ?? ticketsError ?? paymentsError
  const summaries = summarizeClients(clients as Client[], tickets as Ticket[], payments as Payment[])
  const urlsByPath = await signedPhotoUrls(summaries.map((client) => client.photo_path).filter((path): path is string => Boolean(path)))
  const photoUrls: Record<string, string> = {}
  for (const client of summaries) {
    const url = client.photo_path ? urlsByPath[client.photo_path] : undefined
    if (url) photoUrls[client.id] = url
  }
  return {
    clients: summaries,
    total: summaries.reduce((sum, client) => sum + Math.max(client.balance, 0), 0),
    tickets: tickets as Ticket[],
    payments: payments as Payment[],
    supportsOpeningBalance: !originProbe.error,
    supportsClientPhoto: !photoProbe.error,
    photoUrls,
    displayName: profile.display_name,
  }
}

export async function createClient(user: User, input: ClientInput): Promise<Client> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('clients').insert({
    store_id: storeId,
    name: input.name.trim(),
    phone: input.phone.trim() || null,
    nickname: input.nickname?.trim() || null,
    note: input.note?.trim() || null,
    email: input.email ?? null,
  }).select().single()
  if (error) throw error
  return data as Client
}

export async function createTicket(user: User, clientId: string, amountCents: number, concept: string): Promise<Ticket> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('tickets').insert({ store_id: storeId, client_id: clientId, amount_cents: amountCents, concept: concept.trim() || null, created_by: user.id }).select().single()
  if (error) throw error
  return data as Ticket
}

/**
 * Registra la deuda que el cliente ya tenia antes de usar La Libreta.
 * No inventa compras: es un unico movimiento con origen `opening_balance`.
 */
export async function createOpeningBalance(user: User, clientId: string, amountCents: number, note: string): Promise<Ticket> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('tickets').insert({ store_id: storeId, client_id: clientId, amount_cents: amountCents, concept: note.trim() || null, created_by: user.id, origin: 'opening_balance' }).select().single()
  if (error) throw error
  return data as Ticket
}

export async function attachTicketPhoto(ticket: Ticket, file: File): Promise<Ticket> {
  const path = `${ticket.store_id}/${ticket.client_id}/${ticket.id}/${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('ticket-photos').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data, error } = await supabase.from('tickets').update({ photo_path: path }).eq('id', ticket.id).select().single()
  if (error) throw error
  return data as Ticket
}

export async function loadClientHistory(user: User, clientId: string): Promise<{ client: Client; tickets: Ticket[]; payments: Payment[]; balance: number }> {
  const storeId = await currentStore(user)
  const [{ data: client, error: clientError }, { data: tickets, error: ticketsError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).eq('store_id', storeId).single(),
    supabase.from('tickets').select('*').eq('client_id', clientId).eq('store_id', storeId).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').eq('client_id', clientId).eq('store_id', storeId).order('created_at', { ascending: false }),
  ])
  if (clientError || ticketsError || paymentsError) throw clientError ?? ticketsError ?? paymentsError
  return { client: client as Client, tickets: tickets as Ticket[], payments: payments as Payment[], balance: calculateActiveBalance(tickets as Ticket[], payments as Payment[]) }
}

export async function createPayment(user: User, clientId: string, amountCents: number): Promise<Payment> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('payments').insert({ store_id: storeId, client_id: clientId, amount_cents: amountCents, created_by: user.id }).select().single()
  if (error) throw error
  return data as Payment
}

export async function voidMovement(user: User, table: 'tickets' | 'payments', id: string, reason: string): Promise<void> {
  const values: Record<string, string> = { voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason.trim() }
  if (table === 'tickets') values.status = 'voided'
  const { error } = await supabase.from(table).update(values).eq('id', id)
  if (error) throw error
}

export async function signedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('ticket-photos').createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
