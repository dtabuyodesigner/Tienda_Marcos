import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachTicketPhoto, summarizeClients, type Client, type Payment, type Ticket } from './data'

const { eq, mockSupabase, select, single, update, upload } = vi.hoisted(() => {
  const upload = vi.fn()
  const update = vi.fn()
  const eq = vi.fn()
  const select = vi.fn()
  const single = vi.fn()
  const mockSupabase = {
    storage: {
      from: vi.fn(() => ({ upload })),
    },
    from: vi.fn(() => ({ update })),
  }
  return { eq, mockSupabase, select, single, update, upload }
})

vi.mock('./supabase', () => ({ supabase: mockSupabase }))

function client(id: string, name = id): Client {
  return { id, store_id: 'store-1', name, phone: null, nickname: null, note: null, active: true }
}

function ticket(values: Partial<Ticket> & Pick<Ticket, 'id' | 'client_id' | 'amount_cents' | 'status'>): Ticket {
  return {
    store_id: 'store-1',
    concept: null,
    photo_path: null,
    created_by: 'user-1',
    created_at: '2026-08-27T10:00:00Z',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...values,
  }
}

function payment(values: Partial<Payment> & Pick<Payment, 'id' | 'client_id' | 'amount_cents'>): Payment {
  return {
    store_id: 'store-1',
    created_by: 'user-1',
    created_at: '2026-08-27T10:00:00Z',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...values,
  }
}

describe('data helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => 'photo-id' })
    single.mockResolvedValue({
      data: ticket({ id: 'ticket-1', client_id: 'client-1', amount_cents: 1840, status: 'active', photo_path: 'store-1/client-1/ticket-1/photo-id-proof.jpg' }),
      error: null,
    })
    select.mockReturnValue({ single })
    eq.mockReturnValue({ select })
    update.mockReturnValue({ eq })
  })

  it('summarizes clients with active tickets and active payments only', () => {
    const summaries = summarizeClients(
      [client('client-1', 'Ana'), client('client-2', 'Marcos')],
      [
        ticket({ id: 'ticket-1', client_id: 'client-1', amount_cents: 1840, status: 'active' }),
        ticket({ id: 'ticket-2', client_id: 'client-1', amount_cents: 990, status: 'voided' }),
        ticket({ id: 'ticket-3', client_id: 'client-2', amount_cents: 500, status: 'active' }),
      ],
      [
        payment({ id: 'payment-1', client_id: 'client-1', amount_cents: 700 }),
        payment({ id: 'payment-2', client_id: 'client-1', amount_cents: 400, created_at: '2026-08-27T10:30:00Z', voided_at: '2026-08-27T10:35:00Z' }),
      ],
    )

    expect(summaries).toEqual([
      expect.objectContaining({ id: 'client-1', balance: 1140, lastActivityAt: '2026-08-27T10:30:00Z' }),
      expect.objectContaining({ id: 'client-2', balance: 500, lastActivityAt: '2026-08-27T10:00:00Z' }),
    ])
  })

  it('uploads photos to the private ticket bucket and stores the path on the ticket', async () => {
    upload.mockResolvedValue({ error: null })

    const updated = await attachTicketPhoto(ticket({ id: 'ticket-1', client_id: 'client-1', amount_cents: 1840, status: 'active' }), new File(['proof'], 'proof.jpg', { type: 'image/jpeg' }))

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('ticket-photos')
    expect(upload).toHaveBeenCalledWith('store-1/client-1/ticket-1/photo-id-proof.jpg', expect.any(File), { contentType: 'image/jpeg', upsert: false })
    expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
    expect(update).toHaveBeenCalledWith({ photo_path: 'store-1/client-1/ticket-1/photo-id-proof.jpg' })
    expect(eq).toHaveBeenCalledWith('id', 'ticket-1')
    expect(updated.photo_path).toBe('store-1/client-1/ticket-1/photo-id-proof.jpg')
  })

  it('does not update the ticket when photo upload fails, allowing retry without another ticket', async () => {
    upload.mockResolvedValueOnce({ error: new Error('storage failed') }).mockResolvedValueOnce({ error: null })
    const original = ticket({ id: 'ticket-1', client_id: 'client-1', amount_cents: 1840, status: 'active' })
    const file = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' })

    await expect(attachTicketPhoto(original, file)).rejects.toThrow('storage failed')
    expect(update).not.toHaveBeenCalled()

    await expect(attachTicketPhoto(original, file)).resolves.toEqual(expect.objectContaining({ photo_path: expect.stringContaining('/ticket-1/') }))
    expect(upload).toHaveBeenCalledTimes(2)
  })
})
