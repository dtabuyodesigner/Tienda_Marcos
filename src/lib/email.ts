/** Limite real de una direccion de correo (RFC 5321). */
const MAX_EMAIL_LENGTH = 254

const INVALID_FORMAT = 'Revisa el email: no parece una dirección válida.'
const TOO_LONG = `Revisa el email: es demasiado largo (máximo ${MAX_EMAIL_LENGTH} caracteres).`

/** Normaliza lo que teclea el usuario. Devuelve null si no hay email. */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  // Quitamos todo espacio (tambien interior) porque al pegar desde WhatsApp o
  // la agenda del movil suelen colarse espacios y saltos de linea invisibles.
  const cleaned = value.replace(/\s+/g, '').toLowerCase()
  return cleaned === '' ? null : cleaned
}

/** Mensaje de error listo para mostrar, o null si el email es aceptable (incluido el caso "sin email"). */
export function emailProblem(value: string | null | undefined): string | null {
  const normalized = normalizeEmail(value)
  if (normalized === null) return null

  // Validamos sobre el texto recortado, NO sobre el normalizado: un espacio en
  // medio casi siempre es un error de tecleo o dos direcciones pegadas, y
  // preferimos preguntarle a Marcos antes que guardar algo que nadie escribio.
  const candidate = (value as string).trim().toLowerCase()
  if (candidate.length > MAX_EMAIL_LENGTH) return TOO_LONG
  if (/\s/.test(candidate)) return INVALID_FORMAT

  return isPlausibleAddress(candidate) ? null : INVALID_FORMAT
}

/**
 * Comprobacion deliberadamente permisiva: solo miramos la forma `algo@algo.algo`.
 * No intentamos cumplir la RFC entera ni consultar DNS/MX (imposible en el
 * navegador), asi que aceptamos direcciones raras pero validas antes que
 * rechazar la de un cliente real. Solo cortamos lo que seguro esta mal.
 */
function isPlausibleAddress(address: string): boolean {
  const parts = address.split('@')
  if (parts.length !== 2) return false

  const [local, domain] = parts
  if (local === '' || domain === '') return false
  // En la parte local aceptamos cualquier caracter (+, guiones, apostrofes...)
  // salvo puntos mal colocados, que son el fallo tipico al teclear.
  if (hasBadDots(local)) return false
  if (hasBadDots(domain)) return false

  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (!labels.every((label) => /^[a-z0-9-]+$/.test(label))) return false

  const tld = labels[labels.length - 1]
  return /^[a-z]{2,}$/.test(tld)
}

function hasBadDots(part: string): boolean {
  return part.startsWith('.') || part.endsWith('.') || part.includes('..')
}
