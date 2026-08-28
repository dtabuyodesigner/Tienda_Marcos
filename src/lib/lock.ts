// Logica pura del bloqueo por PIN: decide *cuando* toca bloquear, sin React,
// sin DOM y sin almacenamiento. Todo entra por parametros para que se pueda
// probar con relojes ficticios.

export const LOCK_OPTIONS = [0, 1, 5, 15, 30] as const

export type LockMinutes = (typeof LOCK_OPTIONS)[number]

export type LockState = {
  enabled: boolean
  minutes: LockMinutes
  lastActiveAt: number | null
}

const MS_PER_MINUTE = 60_000

// Tope de espera entre comprobaciones. Aunque falte media hora para bloquear,
// no programamos un temporizador de media hora: el movil puede irse a segundo
// plano, dormir o cambiar la hora del sistema, y queremos volver a mirar el
// reloj como mucho un minuto despues.
export const MAX_CHECK_DELAY_MS = 60_000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function lockOptionLabel(minutes: LockMinutes): string {
  if (minutes === 0) return 'Nunca'
  if (minutes === 1) return '1 minuto'
  return `${minutes} minutos`
}

/**
 * Decide si la aplicacion debe estar bloqueada ahora mismo.
 *
 * Se basa en marcas de tiempo (`lastActiveAt` y `now`) y no en temporizadores
 * a proposito: cuando el navegador manda la pestana a segundo plano los
 * `setTimeout` se congelan o se retrasan indefinidamente, asi que un contador
 * en memoria mentiria al volver. Comparando epoch ms siempre acertamos aunque
 * la app haya estado dormida veinte minutos.
 */
export function shouldLock(state: LockState, now: number): boolean {
  if (!state || state.enabled !== true) return false

  const minutes = state.minutes
  if (!isFiniteNumber(minutes) || minutes <= 0) return false

  // Si no hay hora fiable de ultima actividad (arranque en frio, recarga de la
  // pagina, o un valor corrupto en disco) elegimos el lado seguro: bloquear.
  // Preferimos que Marcos teclee el PIN de mas a que el movil quede abierto.
  const lastActiveAt = state.lastActiveAt
  if (lastActiveAt === null || lastActiveAt === undefined) return true
  if (!isFiniteNumber(lastActiveAt)) return true

  // Con un `now` inutilizable no podemos afirmar que haya pasado el tiempo,
  // asi que no bloqueamos por sorpresa.
  if (!isFiniteNumber(now)) return false

  const elapsed = now - lastActiveAt
  // Reloj movido hacia atras: `elapsed` sale negativo. No es motivo para
  // bloquear ni para reventar, simplemente aun no toca.
  if (elapsed < 0) return false

  return elapsed >= minutes * MS_PER_MINUTE
}

/**
 * Milisegundos que faltan para que toque bloquear, para programar la siguiente
 * comprobacion. Siempre devuelve un numero entre 0 y `MAX_CHECK_DELAY_MS`.
 *
 * Devuelve 0 cuando ya toca bloquear. Con el bloqueo desactivado (o en la
 * opcion `Nunca`) devuelve el tope, nunca 0: quien llama puede interpretar el 0
 * como "bloquea ya", y ademas conviene seguir despertando de vez en cuando por
 * si el ajuste cambia mientras la app esta abierta.
 */
export function nextCheckDelayMs(state: LockState, now: number): number {
  if (!state || state.enabled !== true) return MAX_CHECK_DELAY_MS

  const minutes = state.minutes
  if (!isFiniteNumber(minutes) || minutes <= 0) return MAX_CHECK_DELAY_MS

  if (shouldLock(state, now)) return 0

  const lastActiveAt = state.lastActiveAt
  if (!isFiniteNumber(lastActiveAt) || !isFiniteNumber(now)) return MAX_CHECK_DELAY_MS

  const remaining = lastActiveAt + minutes * MS_PER_MINUTE - now
  if (!Number.isFinite(remaining) || remaining <= 0) return 0
  return Math.min(remaining, MAX_CHECK_DELAY_MS)
}
