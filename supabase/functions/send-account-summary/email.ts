// Renderizado del correo de resumen de cuenta.
//
// Aqui NO se calcula nada: todo lo economico llega ya resuelto y formateado en
// el `AccountSummary` del modelo canonico. Este fichero solo maqueta.
//
// El correo es sobrio a proposito: estilos en linea, sin imagenes remotas, sin
// fuentes externas, sin JavaScript, sin pixel de seguimiento y sin una sola
// linea de marketing. Es un extracto de cuenta, no una campana.

import type { AccountSummary, ShareMovement } from '../_shared/account-summary.ts'

export const ACCOUNT_EMAIL_SUBJECT = 'Tu cuenta — La Libreta de Marcos'

const INK = '#1b1c1a'
const DEEP = '#002446'
const GREEN = '#2c694e'
const PAPER = '#faf9f5'

const INTRO = 'Este es el resumen de tu cuenta en La Libreta de Marcos.'
const DISCLAIMER = 'Este mensaje es únicamente un resumen de tu cuenta.'

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

/** El nombre y el concepto los escribe el tendero: nunca van crudos al HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function movementConcept(movement: ShareMovement): string {
  const concept = movement.concept?.trim()
  return concept ? `${movement.label} · ${concept}` : movement.label
}

function movementRow(movement: ShareMovement, index: number): string {
  const stripe = index % 2 === 1 ? PAPER : '#ffffff'
  const amountColor = movement.kind === 'payment' ? GREEN : INK
  const cell = `padding:10px 12px;border-bottom:1px solid #e6e3dc;font-size:15px;color:${INK};`
  return [
    `<tr style="background-color:${stripe};">`,
    `<td style="${cell}white-space:nowrap;">${escapeHtml(movement.date)}</td>`,
    `<td style="${cell}">${escapeHtml(movementConcept(movement))}</td>`,
    `<td style="${cell}text-align:right;white-space:nowrap;color:${amountColor};font-weight:600;">${escapeHtml(movement.amount)}</td>`,
    '</tr>',
  ].join('')
}

function movementsTable(summary: AccountSummary): string {
  if (summary.movements.length === 0) {
    return `<p style="margin:0 0 20px;font-size:15px;color:${INK};">No hay movimientos en tu cuenta.</p>`
  }

  const head = `padding:10px 12px;border-bottom:2px solid ${DEEP};font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${DEEP};text-align:left;`
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 20px;">',
    '<thead><tr>',
    `<th style="${head}">Fecha</th>`,
    `<th style="${head}">Concepto</th>`,
    `<th style="${head}text-align:right;">Importe</th>`,
    '</tr></thead>',
    '<tbody>',
    summary.movements.map(movementRow).join(''),
    '</tbody></table>',
  ].join('')
}

function renderHtml(summary: AccountSummary): string {
  const aging = summary.agingLine
    ? `<p style="margin:0 0 20px;font-size:15px;color:${DEEP};">${escapeHtml(summary.agingLine)}</p>`
    : ''

  return [
    `<div style="margin:0;padding:24px 12px;background-color:${PAPER};font-family:Helvetica,Arial,sans-serif;color:${INK};">`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">',
    '<tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e6e3dc;">',
    '<tr><td style="padding:28px 24px;">',
    `<p style="margin:0 0 4px;font-size:18px;font-weight:700;color:${DEEP};">${escapeHtml(summary.storeName)}</p>`,
    `<p style="margin:0 0 24px;font-size:13px;color:#5c5f5b;">${escapeHtml(summary.date)}</p>`,
    `<p style="margin:0 0 12px;font-size:16px;color:${INK};">Hola ${escapeHtml(summary.clientName)}:</p>`,
    `<p style="margin:0 0 20px;font-size:15px;color:${INK};">${INTRO}</p>`,
    movementsTable(summary),
    `<p style="margin:0 0 8px;padding:12px 14px;background-color:${PAPER};border-left:4px solid ${DEEP};font-size:17px;font-weight:700;color:${DEEP};">Pendiente actual: ${escapeHtml(summary.balance)}</p>`,
    aging,
    `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6e3dc;font-size:13px;color:#5c5f5b;">${DISCLAIMER}</p>`,
    `<p style="margin:16px 0 0;font-size:13px;color:${INK};font-weight:600;">${escapeHtml(summary.storeName)}</p>`,
    `<p style="margin:2px 0 0;font-size:13px;color:#5c5f5b;">${escapeHtml(summary.storeLocation)}</p>`,
    '</td></tr></table>',
    '</td></tr></table>',
    '</div>',
  ].join('')
}

function renderText(summary: AccountSummary): string {
  const lines = [
    `Hola ${summary.clientName}:`,
    '',
    INTRO,
    '',
  ]

  if (summary.movements.length === 0) {
    lines.push('No hay movimientos en tu cuenta.')
  } else {
    lines.push('Movimientos:')
    for (const movement of summary.movements) {
      lines.push(`  ${movement.date}  ${movementConcept(movement)}  ${movement.amount}`)
    }
  }

  lines.push('', `Pendiente actual: ${summary.balance}`)
  if (summary.agingLine) lines.push(summary.agingLine)
  lines.push('', DISCLAIMER, '', summary.storeName, summary.storeLocation)

  return lines.join('\n')
}

export function renderAccountEmail(summary: AccountSummary): RenderedEmail {
  return {
    subject: ACCOUNT_EMAIL_SUBJECT,
    html: renderHtml(summary),
    text: renderText(summary),
  }
}
