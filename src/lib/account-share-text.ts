// Texto de la cuenta listo para compartir por WhatsApp (y reutilizable como
// texto plano) mas la URL que abre WhatsApp con ese texto ya escrito.
//
// Aqui NO se calcula nada economico: todo llega ya formateado en AccountSummary,
// que es el unico modelo compartible. Si el saldo hay que tocarlo, se toca alli.
// Y nada se envia solo: esto solo prepara el mensaje para que Marcos lo revise.

import type { AccountSummary } from '../../supabase/functions/_shared/account-summary'

const NO_MOVEMENTS_AND_SETTLED = 'Ahora mismo no tienes ningún movimiento apuntado: tu cuenta está al día.'
const NO_MOVEMENTS = 'Ahora mismo no tienes ningún movimiento apuntado.'
const SETTLED = 'Tu cuenta está al día: no queda nada pendiente.'

/** `12/08 · Compra: 24,50 €`. El dia largo sobra en un chat. */
function movementLine(movement: AccountSummary['movements'][number]): string {
  return `${movement.shortDate} · ${movement.label}: ${movement.amount}`
}

/** La frase de antiguedad llega sin punto final; en un mensaje si lo lleva. */
function asSentence(line: string): string {
  return /[.!?]$/.test(line) ? line : `${line}.`
}

/**
 * Mensaje informativo, en el tono de quien pasa un apunte a un vecino.
 * Nunca reclama ni presiona: dice lo que hay y ya.
 */
export function formatAccountWhatsApp(summary: AccountSummary): string {
  const blocks: string[] = [`Hola ${summary.clientName}, te paso el resumen de tu cuenta de ${summary.storeName}:`]

  const settled = summary.balanceCents <= 0

  if (summary.movements.length === 0) {
    // Sin movimientos y sin saldo es el mismo hecho contado dos veces: una linea basta.
    blocks.push(settled ? NO_MOVEMENTS_AND_SETTLED : NO_MOVEMENTS)
  } else {
    blocks.push(summary.movements.map(movementLine).join('\n'))
  }

  if (!(summary.movements.length === 0 && settled)) {
    const closing = settled ? SETTLED : `Pendiente: ${summary.balance}`
    // La antiguedad va pegada al saldo: es informacion del mismo dato.
    blocks.push(summary.agingLine && !settled ? `${closing}\n${asSentence(summary.agingLine)}` : closing)
  }

  return blocks.join('\n\n')
}

/**
 * Deja el telefono como lo quiere wa.me: solo digitos, con prefijo de pais.
 * Devuelve null antes que inventarse un numero: compartir sin destinatario es
 * mejor que abrir el chat de otra persona.
 */
export function normalizeSpanishPhone(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null

  const trimmed = phone.trim()
  if (trimmed === '') return null

  // Se admiten los separadores que la gente teclea; cualquier otro caracter
  // (letras, barras, extensiones) descarta el numero entero.
  const withoutSeparators = trimmed.replace(/^\+/, '').replace(/[\s.\-()]/g, '')
  if (!/^\d+$/.test(withoutSeparators)) return null

  // `00` es el prefijo internacional tecleado a la vieja usanza; wa.me no lo entiende.
  const digits = withoutSeparators.startsWith('00') ? withoutSeparators.slice(2) : withoutSeparators

  if (digits.length === 9 && /^[6789]/.test(digits)) return `34${digits}`
  if (digits.length === 11 && digits.startsWith('34')) return digits
  // Extranjeros: se respetan tal cual dentro del rango util de E.164. Con solo
  // nueve digitos y sin forma de movil espanol no hay prefijo que adivinar.
  if (digits.length >= 10 && digits.length <= 15) return digits

  return null
}

/**
 * URL que abre WhatsApp con el mensaje escrito. Sin telefono valido se abre el
 * selector de contactos, que nunca bloquea el compartir.
 */
export function whatsAppShareUrl(text: string, phone?: string | null): string {
  const normalized = normalizeSpanishPhone(phone)
  const encoded = encodeURIComponent(text)
  return `https://wa.me/${normalized ?? ''}?text=${encoded}`
}
