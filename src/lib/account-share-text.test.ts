import { describe, expect, it } from 'vitest'
import type { AccountSummary, ShareMovement } from '../../supabase/functions/_shared/account-summary'
import { formatAccountWhatsApp, normalizeSpanishPhone, whatsAppShareUrl } from './account-share-text'

function movement(partial: Partial<ShareMovement> & Pick<ShareMovement, 'kind' | 'shortDate' | 'label' | 'amount'>): ShareMovement {
  return {
    date: `${partial.shortDate}/2025`,
    amountCents: 0,
    concept: null,
    ...partial,
  }
}

function summary(partial: Partial<AccountSummary> = {}): AccountSummary {
  return {
    storeName: 'La Libreta de Marcos',
    storeLocation: 'Covirán · San Miguel de las Dueñas',
    clientName: 'María',
    date: '27/08/2025',
    movements: [],
    balanceCents: 0,
    balance: '0,00 €',
    agingLine: null,
    hasOpeningBalance: false,
    ...partial,
  }
}

const cuentaTipica = summary({
  movements: [
    movement({ kind: 'purchase', shortDate: '12/08', label: 'Compra', amount: '24,50 €', amountCents: 2450 }),
    movement({ kind: 'purchase', shortDate: '18/08', label: 'Compra', amount: '15,00 €', amountCents: 1500 }),
    movement({ kind: 'payment', shortDate: '20/08', label: 'Pago', amount: '-20,00 €', amountCents: -2000 }),
  ],
  balanceCents: 1950,
  balance: '19,50 €',
})

describe('formatAccountWhatsApp', () => {
  it('lista compras y pagos y cierra con el saldo pendiente', () => {
    expect(formatAccountWhatsApp(cuentaTipica)).toBe(
      [
        'Hola María, te paso el resumen de tu cuenta de La Libreta de Marcos:',
        '',
        '12/08 · Compra: 24,50 €',
        '18/08 · Compra: 15,00 €',
        '20/08 · Pago: -20,00 €',
        '',
        'Pendiente: 19,50 €',
      ].join('\n'),
    )
  })

  it('usa la fecha corta, no la larga', () => {
    const text = formatAccountWhatsApp(cuentaTipica)
    expect(text).toContain('12/08 · Compra')
    expect(text).not.toContain('12/08/2025')
  })

  it('etiqueta el saldo anterior como tal y nunca como una compra', () => {
    const text = formatAccountWhatsApp(
      summary({
        movements: [
          movement({ kind: 'opening_balance', shortDate: '01/07', label: 'Saldo anterior', amount: '40,00 €', amountCents: 4000 }),
          movement({ kind: 'purchase', shortDate: '05/07', label: 'Compra', amount: '10,00 €', amountCents: 1000 }),
        ],
        balanceCents: 5000,
        balance: '50,00 €',
        hasOpeningBalance: true,
      }),
    )
    expect(text).toContain('01/07 · Saldo anterior: 40,00 €')
    expect(text).not.toContain('01/07 · Compra')
  })

  it('anade la antiguedad exacta como frase final', () => {
    const text = formatAccountWhatsApp(summary({ ...cuentaTipica, agingLine: 'Pendiente desde hace 15 días' }))
    expect(text.endsWith('Pendiente: 19,50 €\nPendiente desde hace 15 días.')).toBe(true)
  })

  it('conserva el matiz aproximado de un saldo anterior', () => {
    const text = formatAccountWhatsApp(summary({ ...cuentaTipica, agingLine: 'Pendiente desde hace al menos 15 días' }))
    expect(text).toContain('Pendiente desde hace al menos 15 días.')
  })

  it('no duplica el punto final si la frase ya lo trae', () => {
    const text = formatAccountWhatsApp(summary({ ...cuentaTipica, agingLine: 'Pendiente desde hace 15 días.' }))
    expect(text).not.toContain('días..')
  })

  it('sigue teniendo sentido sin movimientos', () => {
    expect(formatAccountWhatsApp(summary())).toBe(
      [
        'Hola María, te paso el resumen de tu cuenta de La Libreta de Marcos:',
        '',
        'Ahora mismo no tienes ningún movimiento apuntado: tu cuenta está al día.',
      ].join('\n'),
    )
  })

  it('cuenta el saldo cero con naturalidad, no como "Pendiente: 0,00 €"', () => {
    const text = formatAccountWhatsApp(
      summary({
        movements: [
          movement({ kind: 'purchase', shortDate: '12/08', label: 'Compra', amount: '20,00 €', amountCents: 2000 }),
          movement({ kind: 'payment', shortDate: '20/08', label: 'Pago', amount: '-20,00 €', amountCents: -2000 }),
        ],
      }),
    )
    expect(text).toContain('Tu cuenta está al día: no queda nada pendiente.')
    expect(text).not.toContain('Pendiente: 0,00 €')
  })

  it('no reclama: evita el vocabulario de cobro agresivo', () => {
    const textos = [
      formatAccountWhatsApp(cuentaTipica),
      formatAccountWhatsApp(summary()),
      formatAccountWhatsApp(summary({ ...cuentaTipica, agingLine: 'Pendiente desde hace al menos 40 días' })),
    ]
    for (const texto of textos) {
      const plano = texto.toLowerCase()
      for (const prohibida of ['debes pagar', 'moroso', 'retraso', 'impago', 'deuda vencida', 'reclamación', 'reclamacion']) {
        expect(plano).not.toContain(prohibida)
      }
    }
  })

  it('no filtra nada privado ni interno de la aplicacion', () => {
    const text = formatAccountWhatsApp(cuentaTipica).toLowerCase()
    for (const fuga of ['note', 'nickname', 'store_id', 'photo_path', 'storage', 'token']) {
      expect(text).not.toContain(fuga)
    }
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})

describe('whatsAppShareUrl', () => {
  it('apunta al destinatario cuando el telefono es valido', () => {
    expect(whatsAppShareUrl('Hola', '612 345 678')).toBe('https://wa.me/34612345678?text=Hola')
  })

  it('abre el selector de contactos si no hay telefono', () => {
    expect(whatsAppShareUrl('Hola')).toBe('https://wa.me/?text=Hola')
    expect(whatsAppShareUrl('Hola', null)).toBe('https://wa.me/?text=Hola')
  })

  it('un telefono imposible no impide compartir', () => {
    expect(whatsAppShareUrl('Hola', 'llamar a la tienda')).toBe('https://wa.me/?text=Hola')
  })

  it('codifica saltos de linea, acentos y simbolos', () => {
    const url = whatsAppShareUrl(formatAccountWhatsApp(cuentaTipica))
    expect(url).toContain('%0A')
    expect(url).toContain('%E2%82%AC')
    expect(url).toContain('%C2%B7')
    expect(url).not.toContain('\n')
  })

  it('codifica el ampersand para que no parta la query', () => {
    const url = whatsAppShareUrl('Pan & leche')
    expect(url).toBe('https://wa.me/?text=Pan%20%26%20leche')
  })

  it('el texto se recupera identico al decodificar', () => {
    const texto = formatAccountWhatsApp(summary({ ...cuentaTipica, clientName: 'Ana Ruiz & Muñoz', agingLine: 'Pendiente desde hace 15 días' }))
    const url = whatsAppShareUrl(texto, '+34 612 345 678')
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(texto)
  })
})

describe('normalizeSpanishPhone', () => {
  it('asume Espana en los nueve digitos nacionales', () => {
    expect(normalizeSpanishPhone('612345678')).toBe('34612345678')
    expect(normalizeSpanishPhone('987654321')).toBe('34987654321')
  })

  it('limpia espacios, guiones, puntos y parentesis', () => {
    expect(normalizeSpanishPhone(' 612-34.56 78 ')).toBe('34612345678')
    expect(normalizeSpanishPhone('(612) 345 678')).toBe('34612345678')
  })

  it('conserva el prefijo escrito con + o con 00', () => {
    expect(normalizeSpanishPhone('+34 612 345 678')).toBe('34612345678')
    expect(normalizeSpanishPhone('0034612345678')).toBe('34612345678')
  })

  it('respeta un numero extranjero', () => {
    expect(normalizeSpanishPhone('+44 7911 123456')).toBe('447911123456')
  })

  it('devuelve null antes que inventarse un numero', () => {
    expect(normalizeSpanishPhone('no lo sé')).toBeNull()
    expect(normalizeSpanishPhone('612345')).toBeNull()
    expect(normalizeSpanishPhone('612 345 678 ext 4')).toBeNull()
    expect(normalizeSpanishPhone('123456789')).toBeNull()
    expect(normalizeSpanishPhone('+34612345678901234')).toBeNull()
    expect(normalizeSpanishPhone('')).toBeNull()
    expect(normalizeSpanishPhone('   ')).toBeNull()
    expect(normalizeSpanishPhone(null)).toBeNull()
    expect(normalizeSpanishPhone(undefined)).toBeNull()
  })
})
