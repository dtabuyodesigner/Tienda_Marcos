import { describe, expect, it } from 'vitest'
import {
  LOCK_OPTIONS,
  MAX_CHECK_DELAY_MS,
  lockOptionLabel,
  nextCheckDelayMs,
  shouldLock,
  type LockMinutes,
  type LockState,
} from './lock'

const T0 = 1_700_000_000_000
const MINUTE = 60_000

function state(minutes: LockMinutes, lastActiveAt: number | null, enabled = true): LockState {
  return { enabled, minutes, lastActiveAt }
}

describe('lockOptionLabel', () => {
  it('describe las cinco opciones en lenguaje humano', () => {
    expect(lockOptionLabel(0)).toBe('Nunca')
    expect(lockOptionLabel(1)).toBe('1 minuto')
    expect(lockOptionLabel(5)).toBe('5 minutos')
    expect(lockOptionLabel(15)).toBe('15 minutos')
    expect(lockOptionLabel(30)).toBe('30 minutos')
  })

  it('cubre todas las opciones declaradas', () => {
    for (const minutes of LOCK_OPTIONS) {
      expect(lockOptionLabel(minutes).length).toBeGreaterThan(0)
    }
  })
})

describe('shouldLock', () => {
  it('con la opcion Nunca no bloquea aunque pasen horas', () => {
    expect(shouldLock(state(0, T0), T0 + 6 * 60 * MINUTE)).toBe(false)
    expect(shouldLock(state(0, null), T0 + 24 * 60 * MINUTE)).toBe(false)
  })

  it('desactivado no bloquea nunca', () => {
    expect(shouldLock(state(1, T0, false), T0 + 10 * MINUTE)).toBe(false)
    expect(shouldLock(state(30, null, false), T0 + 10 * MINUTE)).toBe(false)
  })

  it('con 1 minuto no bloquea a los 59 segundos y si a los 60 y 61', () => {
    expect(shouldLock(state(1, T0), T0 + 59_000)).toBe(false)
    expect(shouldLock(state(1, T0), T0 + 60_000)).toBe(true)
    expect(shouldLock(state(1, T0), T0 + 61_000)).toBe(true)
  })

  it('respeta el umbral justo por debajo y por encima en 5, 15 y 30 minutos', () => {
    for (const minutes of [5, 15, 30] as const) {
      const umbral = minutes * MINUTE
      expect(shouldLock(state(minutes, T0), T0 + umbral - 1)).toBe(false)
      expect(shouldLock(state(minutes, T0), T0 + umbral)).toBe(true)
      expect(shouldLock(state(minutes, T0), T0 + umbral + 1)).toBe(true)
    }
  })

  it('la actividad reciente reinicia la cuenta', () => {
    const ahora = T0 + 20 * MINUTE
    // Con la marca vieja tocaria bloquear...
    expect(shouldLock(state(5, T0), ahora)).toBe(true)
    // ...pero al refrescar `lastActiveAt` vuelve a haber margen.
    expect(shouldLock(state(5, ahora - 10_000), ahora)).toBe(false)
  })

  it('al volver de segundo plano decide mirando el reloj', () => {
    const vuelta = T0 + 20 * MINUTE
    expect(shouldLock(state(15, T0), vuelta)).toBe(true)
    expect(shouldLock(state(30, T0), vuelta)).toBe(false)
  })

  it('sin lastActiveAt bloquea si el bloqueo esta activado', () => {
    expect(shouldLock(state(1, null), T0)).toBe(true)
    expect(shouldLock(state(30, null), T0)).toBe(true)
    expect(shouldLock(state(30, null, false), T0)).toBe(false)
  })

  it('con el reloj movido hacia atras no bloquea ni revienta', () => {
    expect(shouldLock(state(5, T0), T0 - 60 * MINUTE)).toBe(false)
    expect(shouldLock(state(5, T0), T0 - 1)).toBe(false)
    expect(shouldLock(state(5, T0), T0)).toBe(false)
  })

  it('tolera valores no finitos sin lanzar', () => {
    expect(() => shouldLock(state(5, Number.NaN), T0)).not.toThrow()
    expect(() => shouldLock(state(5, Number.POSITIVE_INFINITY), T0)).not.toThrow()
    expect(() => shouldLock(state(5, T0), Number.NaN)).not.toThrow()
    expect(() => shouldLock(state(5, T0), Number.POSITIVE_INFINITY)).not.toThrow()
    expect(() => shouldLock(state(5, Number.NaN), Number.NaN)).not.toThrow()

    expect(typeof shouldLock(state(5, Number.NaN), T0)).toBe('boolean')
    // `now` inservible: no bloqueamos por sorpresa.
    expect(shouldLock(state(5, T0), Number.NaN)).toBe(false)
    // Marca de actividad corrupta: se trata como desconocida, lado seguro.
    expect(shouldLock(state(5, Number.NaN), T0)).toBe(true)
    // Con la opcion Nunca los valores raros siguen sin bloquear.
    expect(shouldLock(state(0, Number.NaN), Number.NaN)).toBe(false)
  })
})

describe('nextCheckDelayMs', () => {
  it('devuelve 0 cuando ya toca bloquear', () => {
    expect(nextCheckDelayMs(state(5, T0), T0 + 5 * MINUTE)).toBe(0)
    expect(nextCheckDelayMs(state(5, T0), T0 + 60 * MINUTE)).toBe(0)
    expect(nextCheckDelayMs(state(15, null), T0)).toBe(0)
  })

  it('devuelve lo que falta cuando el umbral esta cerca', () => {
    expect(nextCheckDelayMs(state(1, T0), T0 + 40_000)).toBe(20_000)
    expect(nextCheckDelayMs(state(1, T0), T0 + 59_000)).toBe(1_000)
  })

  it('acota la espera al tope aunque falte mucho', () => {
    expect(nextCheckDelayMs(state(30, T0), T0)).toBe(MAX_CHECK_DELAY_MS)
    expect(nextCheckDelayMs(state(15, T0), T0 + MINUTE)).toBe(MAX_CHECK_DELAY_MS)
    expect(MAX_CHECK_DELAY_MS).toBe(60_000)
  })

  it('nunca devuelve valores negativos ni por encima del tope', () => {
    const instantes = [T0 - 10 * MINUTE, T0, T0 + 1, T0 + 5 * MINUTE, T0 + 999 * MINUTE]
    for (const minutes of LOCK_OPTIONS) {
      for (const ahora of instantes) {
        const delay = nextCheckDelayMs(state(minutes, T0), ahora)
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThanOrEqual(MAX_CHECK_DELAY_MS)
      }
    }
  })

  it('con el bloqueo desactivado o en Nunca devuelve el tope, no 0', () => {
    expect(nextCheckDelayMs(state(5, T0, false), T0 + 60 * MINUTE)).toBe(MAX_CHECK_DELAY_MS)
    expect(nextCheckDelayMs(state(0, T0), T0 + 60 * MINUTE)).toBe(MAX_CHECK_DELAY_MS)
    expect(nextCheckDelayMs(state(0, null), T0)).toBe(MAX_CHECK_DELAY_MS)
  })

  it('con el reloj hacia atras espera como mucho el tope', () => {
    expect(nextCheckDelayMs(state(5, T0), T0 - 60 * MINUTE)).toBe(MAX_CHECK_DELAY_MS)
  })

  it('tolera valores no finitos sin lanzar', () => {
    expect(() => nextCheckDelayMs(state(5, Number.NaN), T0)).not.toThrow()
    expect(() => nextCheckDelayMs(state(5, T0), Number.NaN)).not.toThrow()
    expect(() => nextCheckDelayMs(state(5, T0), Number.POSITIVE_INFINITY)).not.toThrow()
    expect(Number.isFinite(nextCheckDelayMs(state(5, T0), Number.NaN))).toBe(true)
  })
})
