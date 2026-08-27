// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { AccountSummary, ShareMovement } from '../../supabase/functions/_shared/account-summary'
import { accountPdfFileName, generateAccountPdf } from './account-pdf'

function movement(over: Partial<ShareMovement> = {}): ShareMovement {
  return {
    kind: 'purchase',
    date: '20/08/2026',
    shortDate: '20/08',
    label: 'Compra',
    amountCents: 1950,
    amount: '19,50 €',
    concept: 'Pan y leche',
    ...over,
  }
}

function summaryOf(over: Partial<AccountSummary> = {}): AccountSummary {
  return {
    storeName: 'La Libreta de Marcos',
    storeLocation: 'Covirán · San Miguel de las Dueñas',
    clientName: 'Maria Lopez',
    date: '27/08/2026',
    movements: [movement()],
    balanceCents: 1950,
    balance: '19,50 €',
    agingLine: 'Pendiente desde hace 7 dias',
    hasOpeningBalance: false,
    ...over,
  }
}

/**
 * Texto crudo del PDF. Se decodifica en latin1 porque asi un byte es un
 * caracter y buscar cadenas ASCII dentro del binario es fiable.
 *
 * LIMITACION CONOCIDA: los acentos NO viajan como UTF-8 dentro del PDF. Las
 * fuentes base de jspdf usan WinAnsi y las tildes acaban como escapes octales
 * (`d\355as`), asi que aqui solo se buscan cadenas ASCII. Los flujos SI van sin
 * comprimir (`compress: false` en account-pdf.ts), por eso el texto es visible.
 */
async function pdfText(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer())
}

/** Objetos de pagina del PDF: `/Type /Page` sin la `s` de `/Pages`. */
function pageCount(text: string): number {
  return (text.match(/\/Type \/Page[^s]/g) ?? []).length
}

describe('accountPdfFileName', () => {
  it('usa el nombre en minusculas y la fecha en aaaa-mm-dd', () => {
    expect(accountPdfFileName(summaryOf({ clientName: 'Maria' }))).toBe('cuenta-maria-2026-08-27.pdf')
  })

  it('quita acentos y enes', () => {
    expect(accountPdfFileName(summaryOf({ clientName: 'María Ñuño' }))).toBe('cuenta-maria-nuno-2026-08-27.pdf')
    expect(accountPdfFileName(summaryOf({ clientName: 'José Ángel Muñóz' }))).toBe('cuenta-jose-angel-munoz-2026-08-27.pdf')
  })

  it('elimina barras, puntos y caracteres raros', () => {
    const name = accountPdfFileName(summaryOf({ clientName: '../etc/passwd' }))
    expect(name).toBe('cuenta-etcpasswd-2026-08-27.pdf')
    expect(accountPdfFileName(summaryOf({ clientName: 'Ana\\Bea?*<>|:"' }))).toBe('cuenta-anabea-2026-08-27.pdf')
  })

  it('nunca deja separadores de ruta ni caracteres de control', () => {
    for (const clientName of ['../../secret', 'C:\\Users\\marcos', 'ana\u0000bea', 'ana\nbea', '/////']) {
      const name = accountPdfFileName(summaryOf({ clientName }))
      expect(name).toMatch(/^cuenta-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.pdf$/)
      expect(name).not.toContain('..')
    }
  })

  it('colapsa guiones repetidos y no los deja en los bordes', () => {
    expect(accountPdfFileName(summaryOf({ clientName: '  Ana   -  Bea  ' }))).toBe('cuenta-ana-bea-2026-08-27.pdf')
  })

  it('cae a "cliente" si el nombre queda vacio', () => {
    expect(accountPdfFileName(summaryOf({ clientName: '' }))).toBe('cuenta-cliente-2026-08-27.pdf')
    expect(accountPdfFileName(summaryOf({ clientName: '???' }))).toBe('cuenta-cliente-2026-08-27.pdf')
  })

  it('marca la fecha como sin-fecha si no viene en dd/mm/aaaa', () => {
    expect(accountPdfFileName(summaryOf({ clientName: 'Ana', date: '' }))).toBe('cuenta-ana-sin-fecha.pdf')
  })
})

describe('generateAccountPdf', () => {
  it('devuelve un Blob PDF no vacio con la firma %PDF', async () => {
    const blob = await generateAccountPdf(summaryOf())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(0)
    expect(await pdfText(blob)).toMatch(/^%PDF-/)
  })

  it('pinta la cabecera, el cliente, los movimientos y el pendiente', async () => {
    const text = await pdfText(await generateAccountPdf(summaryOf()))
    expect(text).toContain('La Libreta de Marcos')
    expect(text).toContain('Maria Lopez')
    expect(text).toContain('27/08/2026')
    expect(text).toContain('20/08/2026')
    expect(text).toContain('Compra')
    expect(text).toContain('Pan y leche')
    expect(text).toContain('Pendiente actual')
    // El importe llega ya formateado del modelo: solo se pinta, no se recalcula.
    expect(text).toContain('19,50')
  })

  it('incluye la linea de antiguedad solo si el modelo la trae', async () => {
    const con = await pdfText(await generateAccountPdf(summaryOf({ agingLine: 'Pendiente desde hace 15 dias' })))
    expect(con).toContain('Pendiente desde hace 15 dias')

    const sin = await pdfText(await generateAccountPdf(summaryOf({ agingLine: null })))
    expect(sin).not.toContain('Pendiente desde hace')
  })

  it('genera PDF valido sin movimientos y sin deuda', async () => {
    const blob = await generateAccountPdf(
      summaryOf({ movements: [], balanceCents: 0, balance: '0,00 €', agingLine: null }),
    )
    expect(blob.size).toBeGreaterThan(0)
    const text = await pdfText(blob)
    expect(text).toMatch(/^%PDF-/)
    expect(text).toContain('Sin movimientos registrados.')
    expect(text).toContain('Pendiente actual')
    expect(pageCount(text)).toBe(1)
  })

  it('pagina en vez de salirse de la hoja cuando hay muchos movimientos', async () => {
    const pocos = await pdfText(await generateAccountPdf(summaryOf()))
    expect(pageCount(pocos)).toBe(1)

    const muchos = Array.from({ length: 120 }, (_, index) =>
      movement({ concept: `Compra numero ${index + 1}`, date: '20/08/2026' }),
    )
    const largo = await pdfText(await generateAccountPdf(summaryOf({ movements: muchos })))
    expect(pageCount(largo)).toBeGreaterThan(1)
    // La cabecera de tabla se repite en cada pagina.
    expect((largo.match(/Movimiento/g) ?? []).length).toBeGreaterThanOrEqual(pageCount(largo))
    // El pendiente sigue apareciendo, no se pierde al final.
    expect(largo).toContain('Pendiente actual')
  })

  it('no filtra nada que no este en AccountSummary', async () => {
    // Se cuelan campos privados en el objeto a proposito: si la implementacion
    // recorriese las claves en vez de leer solo las del modelo, se verian aqui.
    const leaky = {
      ...summaryOf(),
      note: 'no fiarle mas, debe de enero',
      nickname: 'el Chispas',
      id: '8f14e45f-ceea-467a-9b3d-c4d1e9f5a2b7',
      store_id: '3b241101-e2bb-4255-8caf-4136c566a962',
      client_id: 'c1f9a0de-1111-4222-8333-444455556666',
      photo_path: 'tickets/2026/08/abc.jpg',
      storage: 'https://xyz.supabase.co/storage/v1/object/tickets/abc.jpg',
      phone: '600123456',
      email: 'maria@example.com',
    } as AccountSummary

    const text = await pdfText(await generateAccountPdf(leaky))

    for (const secret of [
      'no fiarle mas',
      'nickname',
      'el Chispas',
      '8f14e45f',
      'store_id',
      '3b241101',
      'photo_path',
      'tickets/2026',
      'storage',
      '600123456',
      'maria@example.com',
    ]) {
      expect(text).not.toContain(secret)
    }
    // Ningun uuid, venga de donde venga.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})
