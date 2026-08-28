// Configuracion del bloqueo local. Vive SOLO en este dispositivo: el PIN no se
// sincroniza, no viaja a la base de datos y no forma parte de la cuenta.
import type { PinRecord } from './pin'
import type { LockMinutes } from './lock'

const KEY = 'libreta.lock.v1'

export type LockConfig = {
  pin: PinRecord | null
  minutes: LockMinutes
  /** Epoch ms de la ultima interaccion real. Null tras recargar: se bloquea. */
  lastActiveAt: number | null
}

export const EMPTY_LOCK_CONFIG: LockConfig = { pin: null, minutes: 5, lastActiveAt: null }

/** Nunca lanza: un almacenamiento bloqueado o corrupto equivale a "sin PIN". */
export function readLockConfig(): LockConfig {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_LOCK_CONFIG }
    const parsed = JSON.parse(raw) as Partial<LockConfig>
    return {
      pin: parsed.pin && typeof parsed.pin === 'object' ? parsed.pin : null,
      minutes: (typeof parsed.minutes === 'number' ? parsed.minutes : 5) as LockMinutes,
      lastActiveAt: typeof parsed.lastActiveAt === 'number' ? parsed.lastActiveAt : null,
    }
  } catch {
    return { ...EMPTY_LOCK_CONFIG }
  }
}

export function writeLockConfig(config: LockConfig): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(config))
  } catch {
    // Sin almacenamiento el PIN no persiste; no es motivo para romper la aplicacion.
  }
}

export function clearLockConfig(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignorado a proposito
  }
}
