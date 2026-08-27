// PDF descargable del resumen de la cuenta de un cliente.
//
// Entra un AccountSummary y sale un Blob. Nada mas: el modelo ya viene
// formateado (importes como cadena, fecha dd/mm/aaaa) y ya es privado por
// construccion, asi que aqui NO se recalcula ni un centimo ni se aceptan
// otros datos del cliente. Este fichero solo pinta.

import type { AccountSummary, ShareMovement } from '../../supabase/functions/_shared/account-summary'

// --- Nombre de fichero -----------------------------------------------------

/** Quita acentos y enes, pasa a minusculas y deja solo `[a-z0-9-]`. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    // Todo lo que no sea a-z, 0-9 o guion desaparece: asi no puede colarse
    // `/`, `\`, `..` ni un caracter de control en el nombre del fichero.
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** `dd/mm/aaaa` -> `aaaa-mm-dd`. Si no encaja, `sin-fecha`. */
function isoDate(spanish: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(spanish.trim())
  if (!match) return 'sin-fecha'
  return `${match[3]}-${match[2]}-${match[1]}`
}

/** Nombre seguro tipo `cuenta-maria-2026-08-27.pdf`. */
export function accountPdfFileName(summary: AccountSummary): string {
  const name = slugify(summary.clientName) || 'cliente'
  return `cuenta-${name}-${isoDate(summary.date)}.pdf`
}

// --- Documento -------------------------------------------------------------

// Medidas en mm sobre A4 vertical (210 x 297).
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 16
const RIGHT = PAGE_WIDTH - MARGIN
const BOTTOM = PAGE_HEIGHT - MARGIN - 8 // el margen inferior deja sitio al pie
const DATE_X = MARGIN
const LABEL_X = MARGIN + 24
const CONCEPT_WIDTH = RIGHT - LABEL_X - 32 // el importe ocupa la derecha

const INK: [number, number, number] = [0, 36, 70]
const MUTED: [number, number, number] = [110, 110, 110]
const RULE: [number, number, number] = [210, 206, 195]
const BAND: [number, number, number] = [244, 241, 232]

type Doc = {
  setFont: (font: string, style?: string) => void
  setFontSize: (size: number) => void
  setTextColor: (r: number, g: number, b: number) => void
  setDrawColor: (r: number, g: number, b: number) => void
  setFillColor: (r: number, g: number, b: number) => void
  setLineWidth: (width: number) => void
  text: (text: string | string[], x: number, y: number, options?: { align?: string }) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  rect: (x: number, y: number, w: number, h: number, style?: string) => void
  splitTextToSize: (text: string, width: number) => string[]
  addPage: () => void
  setPage: (page: number) => void
  getNumberOfPages: () => number
  output: (type: string) => Blob
}

function movementConceptLines(doc: Doc, movement: ShareMovement): string[] {
  if (!movement.concept) return []
  const concept = movement.concept.trim()
  if (!concept) return []
  return doc.splitTextToSize(concept, CONCEPT_WIDTH)
}

/**
 * Genera el PDF del resumen. Devuelve un Blob `application/pdf` listo para
 * `URL.createObjectURL` o para el share sheet del movil.
 */
export async function generateAccountPdf(summary: AccountSummary): Promise<Blob> {
  // import() dinamico A PROPOSITO, no import estatico arriba.
  //
  // jspdf pesa ~340 kB minificado. Con import estatico entraria en el bundle
  // inicial de la PWA y lo pagaria cada movil en el primer arranque, con datos
  // moviles, aunque casi ninguna visita llegue a descargar un PDF. Asi Vite lo
  // saca a un chunk aparte que solo se baja cuando alguien pulsa "Descargar".
  const { jsPDF } = await import('jspdf')

  // compress: false deja los flujos de texto en claro dentro del PDF. Pesa un
  // pelin mas, pero un resumen de cuenta son unos pocos kB y a cambio el
  // contenido es inspeccionable (tests de privacidad, buscar en el visor).
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false }) as unknown as Doc

  let y = MARGIN

  const rule = (at: number) => {
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, at, RIGHT, at)
  }

  const drawHeader = () => {
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(summary.storeName, MARGIN, MARGIN + 4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(summary.storeLocation, MARGIN, MARGIN + 10)

    rule(MARGIN + 14)
    y = MARGIN + 24
  }

  const drawTableHead = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text('Fecha', DATE_X, y)
    doc.text('Movimiento', LABEL_X, y)
    doc.text('Importe', RIGHT, y, { align: 'right' })
    rule(y + 2)
    y += 8
  }

  /** Salta de pagina si el bloque que viene no cabe, y repite cabeceras. */
  const ensureSpace = (needed: number) => {
    if (y + needed <= BOTTOM) return
    doc.addPage()
    drawHeader()
    drawTableHead()
  }

  drawHeader()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text(summary.clientName, MARGIN, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`Resumen del ${summary.date}`, MARGIN, y)
  y += 12

  drawTableHead()

  if (summary.movements.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text('Sin movimientos registrados.', MARGIN, y)
    y += 10
  }

  for (const movement of summary.movements) {
    const conceptLines = movementConceptLines(doc, movement)
    // Alto de la fila: la linea principal mas las lineas de concepto.
    ensureSpace(7 + conceptLines.length * 4.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(movement.date, DATE_X, y)

    doc.setTextColor(...INK)
    doc.text(movement.label, LABEL_X, y)
    doc.setFont('helvetica', 'bold')
    doc.text(movement.amount, RIGHT, y, { align: 'right' })
    y += 5

    if (conceptLines.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
      doc.text(conceptLines, LABEL_X, y)
      y += conceptLines.length * 4.5
    }

    y += 2.5
  }

  // Bloque del pendiente: siempre entero en la misma pagina.
  ensureSpace(summary.agingLine ? 30 : 22)
  y += 4

  doc.setFillColor(...BAND)
  doc.rect(MARGIN, y - 6, RIGHT - MARGIN, 16, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Pendiente actual', MARGIN + 4, y + 3)
  doc.setFontSize(16)
  doc.text(summary.balance, RIGHT - 4, y + 4, { align: 'right' })
  y += 16

  if (summary.agingLine) {
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(summary.agingLine, MARGIN, y)
  }

  // Pie con numeracion, ya sabiendo cuantas paginas han salido.
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Página ${page} de ${pages}`, RIGHT, PAGE_HEIGHT - MARGIN + 2, { align: 'right' })
  }

  return doc.output('blob')
}
