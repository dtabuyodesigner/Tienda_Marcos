import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { calculateActiveBalance } from './money'

export type Client = { id: string; store_id: string; name: string; phone: string | null; active: boolean }
export type Ticket = { id: string; store_id: string; client_id: string; amount_cents: number; concept: string | null; photo_path: string | null; status: 'active' | 'voided'; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type Payment = { id: string; store_id: string; client_id: string; amount_cents: number; created_by: string; created_at: string; voided_at: string | null; voided_by: string | null; void_reason: string | null }
export type ClientSummary = Client & { balance: number }

export function summarizeClients(clients: Client[], tickets: Ticket[], payments: Payment[]): ClientSummary[] {
  return clients.map((client) => ({
    ...client,
    balance: calculateActiveBalance(
      tickets.filter((ticket) => ticket.client_id === client.id),
      payments.filter((payment) => payment.client_id === client.id),
    ),
  }))
}

async function currentStore(user: User): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('store_id').eq('id', user.id).single()
  if (error) throw error
  return data.store_id
}

export async function loadDashboard(user: User): Promise<{ clients: ClientSummary[]; total: number }> {
  const storeId = await currentStore(user)
  const [{ data: clients, error: clientsError }, { data: tickets, error: ticketsError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase.from('clients').select('*').eq('store_id', storeId).eq('active', true).order('name'),
    supabase.from('tickets').select('*').eq('store_id', storeId).eq('status', 'active'),
    supabase.from('payments').select('*').eq('store_id', storeId).is('voided_at', null),
  ])
  if (clientsError || ticketsError || paymentsError) throw clientsError ?? ticketsError ?? paymentsError
  const summaries = summarizeClients(clients as Client[], tickets as Ticket[], payments as Payment[])
  return { clients: summaries, total: summaries.reduce((sum, client) => sum + Math.max(client.balance, 0), 0) }
}

export async function createClient(user: User, name: string, phone: string): Promise<Client> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('clients').insert({ store_id: storeId, name: name.trim(), phone: phone.trim() || null }).select().single()
  if (error) throw error
  return data as Client
}

export async function createTicket(user: User, clientId: string, amountCents: number, concept: string): Promise<Ticket> {
  const storeId = await currentStore(user)
  const { data, error } = await supabase.from('tickets').insert({ store_id: storeId, client_id: clientId, amount_cents: amountCents, concept: concept.trim() || null, created_by: user.id }).select().single()
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
