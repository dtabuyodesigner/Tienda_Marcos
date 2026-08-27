import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { calculateActiveBalance } from './money'

export type Client = { id: string; store_id: string; name: string; phone: string | null; nickname: string | null; note: string | null; active: boolean; created_at?: string; updated_at?: string }
/** `opening_balance` = deuda anterior a La Libreta, migrada desde los tickets de papel. */
export type MovementOrigin = 'purchase' | 'opening_balance'
// `origin` es opcional porque las filas leidas antes de aplicar la migracion 202608270003 no lo traen.
export type Ticket = { id: string; store_id: string; client_id: string; amount_cents: number; concept: string | null; photo_path: string | null; status: 'active' | 'voided'; origin?: MovementOrigin; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type Payment = { id: string; store_id: string; client_id: string; amount_cents: number; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type ClientSummary = Client & { balance: number; lastActivityAt: string | null }
export type ClientInput = { name: string; phone: string; nickname?: string; note?: string }

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
  return clients.map((client) => ({
    ...client,
    balance: calculateActiveBalance(
      tickets.filter((ticket) => ticket.client_id === client.id),
      payments.filter((payment) => payment.client_id === client.id),
    ),
    lastActivityAt: latestActivityAt(client.id, tickets, payments),
  }))
}

function latestActivityAt(clientId: string, tickets: Ticket[], payments: Payment[]): string | null {
  const dates = [
    ...tickets.filter((ticket) => ticket.client_id === clientId).map((ticket) => ticket.created_at),
    ...payments.filter((payment) => payment.client_id === clientId).map((payment) => payment.created_at),
  ]
  return dates.sort((a, b) => b.localeCompare(a))[0] ?? null
}

async function currentStore(user: User): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('store_id').eq('id', user.id).single()
  if (error) throw error
  return data.store_id
}

export async function loadDashboard(user: User): Promise<{ clients: ClientSummary[]; total: number; supportsOpeningBalance: boolean }> {
  const storeId = await currentStore(user)
  const [{ data: clients, error: clientsError }, { data: tickets, error: ticketsError }, { data: payments, error: paymentsError }, originProbe] = await Promise.all([
    supabase.from('clients').select('*').eq('store_id', storeId).eq('active', true).order('name'),
    supabase.from('tickets').select('*').eq('store_id', storeId).eq('status', 'active'),
    supabase.from('payments').select('*').eq('store_id', storeId).is('voided_at', null),
    // Sonda de esquema: si la migracion 202608270003 aun no esta aplicada, la
    // columna no existe y la accion de saldo anterior no se ofrece.
    supabase.from('tickets').select('origin').limit(1),
  ])
  if (clientsError || ticketsError || paymentsError) throw clientsError ?? ticketsError ?? paymentsError
  const summaries = summarizeClients(clients as Client[], tickets as Ticket[], payments as Payment[])
  return {
    clients: summaries,
    total: summaries.reduce((sum, client) => sum + Math.max(client.balance, 0), 0),
    supportsOpeningBalance: !originProbe.error,
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
