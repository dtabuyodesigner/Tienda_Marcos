export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6

// PBKDF2 con 200.000 iteraciones: en un movil de gama media la derivacion tarda
// del orden de 100-200 ms, que es un parpadeo al desbloquear pero multiplica por
// 200.000 el coste de probar PINes a la fuerza si alguien copia el registro
// guardado en el dispositivo. No subimos mas porque el PIN solo tiene entre 4 y 6
// cifras: contra un ataque offline la defensa real es que el registro no salga del
// movil, no las iteraciones. El registro guarda las suyas propias, asi que este
// numero se puede cambiar en el futuro sin invalidar los PIN ya creados.
export const PIN_ITERATIONS = 200_000

const SALT_BYTES = 16
const HASH_BYTES = 32

export type PinRecord = { salt: string; hash: string; iterations: number }

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

function fromHex(hex: string): Uint8Array | null {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null
  if (!/^[0-9a-f]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export function pinProblem(pin: string, repeated?: string): string | null {
  if (typeof pin !== 'string' || pin.length === 0) {
    return `Escribe un PIN de ${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} números.`
  }
  // El teclado del movil puede colar espacios o letras: se avisa antes que de la
  // longitud porque "1234a" no es un PIN corto, es un PIN con algo que sobra.
  if (!/^[0-9]+$/.test(pin)) {
    return 'El PIN solo puede llevar números, sin letras, espacios ni símbolos.'
  }
  if (pin.length < PIN_MIN_LENGTH) {
    return `El PIN es muy corto: tiene que tener al menos ${PIN_MIN_LENGTH} números.`
  }
  if (pin.length > PIN_MAX_LENGTH) {
    return `El PIN es muy largo: como mucho ${PIN_MAX_LENGTH} números.`
  }
  if (repeated !== undefined) {
    if (typeof repeated !== 'string' || repeated !== pin) {
      return 'Los dos PIN no son iguales. Vuelve a escribirlo abajo.'
    }
  }
  return null
}

async function derive(pin: string, salt: Uint8Array, iterations: number, lengthBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    lengthBytes * 8,
  )
  return new Uint8Array(bits)
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  // Entradas raras no revientan: se derivan como cadena vacia, y ese registro
  // simplemente no lo va a abrir ningun PIN que pase por `pinProblem`.
  const safePin = typeof pin === 'string' ? pin : ''
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(safePin, salt, PIN_ITERATIONS, HASH_BYTES)
  return { salt: toHex(salt), hash: toHex(hash), iterations: PIN_ITERATIONS }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (typeof pin !== 'string') return false
  if (record === null || typeof record !== 'object') return false
  const salt = fromHex(record.salt)
  const expected = fromHex(record.hash)
  // Las iteraciones salen del registro, no de la constante: si algun dia subimos
  // PIN_ITERATIONS, los PIN ya guardados tienen que seguir abriendo la libreta.
  const iterations = record.iterations
  if (!salt || !expected) return false
  if (!Number.isInteger(iterations) || iterations < 1) return false

  let actual: Uint8Array
  try {
    actual = await derive(pin, salt, iterations, expected.length)
  } catch {
    return false
  }

  // Comparacion en tiempo constante: se recorren todos los bytes acumulando
  // diferencias con XOR, sin salir antes ni comparar cadenas con ===, para no
  // filtrar por el tiempo de respuesta cuantos bytes del PIN se acertaron.
  let difference = actual.length ^ expected.length
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (actual[index] ?? 0) ^ expected[index]
  }
  return difference === 0
}

// Los tres primeros fallos salen gratis: detras del mostrador se teclea mal y con
// prisa. A partir del cuarto se espera 5 s y se dobla en cada fallo, con tope de
// 5 minutos, que ya frena a quien prueba PINes a mano sin dejar a Marcos fuera de
// su propia libreta media tarde.
const FREE_ATTEMPTS = 3
const FIRST_DELAY_MS = 5_000
const MAX_DELAY_MS = 5 * 60_000

export function lockoutDelayMs(failedAttempts: number): number {
  if (typeof failedAttempts !== 'number' || !Number.isFinite(failedAttempts)) return 0
  const attempts = Math.floor(failedAttempts)
  if (attempts <= FREE_ATTEMPTS) return 0
  const delay = FIRST_DELAY_MS * 2 ** (attempts - FREE_ATTEMPTS - 1)
  return Math.min(delay, MAX_DELAY_MS)
}
