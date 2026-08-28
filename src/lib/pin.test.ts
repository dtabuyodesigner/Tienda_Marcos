// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PIN_ITERATIONS,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  createPinRecord,
  lockoutDelayMs,
  pinProblem,
  verifyPin,
  type PinRecord,
} from './pin'

const nodeCryptoSpecifier = 'node:' + 'crypto'
const { webcrypto } = (await import(/* @vite-ignore */ nodeCryptoSpecifier)) as { webcrypto: Crypto }

beforeAll(() => {
  // jsdom trae `crypto.getRandomValues` pero no `crypto.subtle`, asi que se pone
  // el crypto real de Node cuando falta.
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto)
})

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Registro construido a mano para poder fijar unas iteraciones distintas de las
// que usa `createPinRecord` hoy.
async function recordWithIterations(pin: string, iterations: number): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)), iterations }
}

describe('pinProblem', () => {
  it('acepta un PIN de 4 numeros', () => {
    expect(pinProblem('1234')).toBeNull()
  })

  it('acepta un PIN de 6 numeros', () => {
    expect(pinProblem('918273')).toBeNull()
  })

  it('rechaza un PIN demasiado corto', () => {
    const problem = pinProblem('123')
    expect(problem).toBeTruthy()
    expect(problem).toContain(String(PIN_MIN_LENGTH))
  })

  it('rechaza un PIN demasiado largo', () => {
    const problem = pinProblem('1234567')
    expect(problem).toBeTruthy()
    expect(problem).toContain(String(PIN_MAX_LENGTH))
  })

  it('rechaza letras y simbolos', () => {
    expect(pinProblem('12a4')).toBeTruthy()
    expect(pinProblem('12-4')).toBeTruthy()
    expect(pinProblem('abcd')).toBeTruthy()
  })

  it('rechaza espacios, aunque el resto sean numeros', () => {
    expect(pinProblem('12 34')).toBeTruthy()
    expect(pinProblem(' 1234')).toBeTruthy()
    expect(pinProblem('1234 ')).toBeTruthy()
  })

  it('rechaza el PIN vacio', () => {
    expect(pinProblem('')).toBeTruthy()
    expect(pinProblem('   ')).toBeTruthy()
  })

  it('trata null, undefined y lo que no sea texto como PIN invalido, sin reventar', () => {
    expect(pinProblem(null as unknown as string)).toBeTruthy()
    expect(pinProblem(undefined as unknown as string)).toBeTruthy()
    expect(pinProblem(1234 as unknown as string)).toBeTruthy()
  })

  it('avisa cuando la repeticion no coincide', () => {
    const problem = pinProblem('1234', '1235')
    expect(problem).toBeTruthy()
    expect(problem).toMatch(/iguales|coinciden/i)
  })

  it('no protesta cuando la repeticion coincide', () => {
    expect(pinProblem('1234', '1234')).toBeNull()
    expect(pinProblem('918273', '918273')).toBeNull()
  })

  it('escribe mensajes para una persona, con acentos y sin jerga', () => {
    const problem = pinProblem('12a4')
    expect(problem).toContain('números')
    expect(problem).not.toMatch(/input|invalid|error|null/i)
  })
})

describe('createPinRecord', () => {
  it('usa una sal distinta en cada registro, asi que el mismo PIN da hashes distintos', async () => {
    const first = await createPinRecord('1234')
    const second = await createPinRecord('1234')
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
    expect(first.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('guarda las iteraciones con las que se derivo', async () => {
    const record = await createPinRecord('1234')
    expect(record.iterations).toBe(PIN_ITERATIONS)
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(100_000)
  })

  it('no deja el PIN en claro en ningun campo del registro', async () => {
    // PIN de 6 cifras a proposito: que aparezca por azar dentro del hexadecimal
    // es una entre dieciseis millones, asi que el test no parpadea.
    const pin = '918273'
    const record = await createPinRecord(pin)
    expect(JSON.stringify(record)).not.toContain(pin)
    for (const value of Object.values(record)) {
      expect(String(value)).not.toContain(pin)
    }
  })

  it('no revienta con entradas raras', async () => {
    await expect(createPinRecord(null as unknown as string)).resolves.toMatchObject({ iterations: PIN_ITERATIONS })
  })
})

describe('verifyPin', () => {
  it('acepta el PIN correcto', async () => {
    const record = await createPinRecord('1234')
    await expect(verifyPin('1234', record)).resolves.toBe(true)
  })

  it('rechaza un PIN completamente distinto', async () => {
    const record = await createPinRecord('1234')
    await expect(verifyPin('987654', record)).resolves.toBe(false)
  })

  it('rechaza un PIN parecido', async () => {
    const record = await createPinRecord('1234')
    await expect(verifyPin('1235', record)).resolves.toBe(false)
    await expect(verifyPin('12345', record)).resolves.toBe(false)
  })

  it('funciona con un registro que declara otras iteraciones', async () => {
    const record = await recordWithIterations('1234', 1_000)
    expect(record.iterations).not.toBe(PIN_ITERATIONS)
    await expect(verifyPin('1234', record)).resolves.toBe(true)
    await expect(verifyPin('1235', record)).resolves.toBe(false)
  })

  it('rechaza sin reventar registros o PIN corruptos', async () => {
    const record = await createPinRecord('1234')
    await expect(verifyPin(null as unknown as string, record)).resolves.toBe(false)
    await expect(verifyPin('1234', null as unknown as PinRecord)).resolves.toBe(false)
    await expect(verifyPin('1234', { ...record, salt: 'no-es-hexadecimal' })).resolves.toBe(false)
    await expect(verifyPin('1234', { ...record, hash: '' })).resolves.toBe(false)
    await expect(verifyPin('1234', { ...record, iterations: 0 })).resolves.toBe(false)
    await expect(verifyPin('1234', { ...record, iterations: Number.NaN })).resolves.toBe(false)
  })
})

describe('lockoutDelayMs', () => {
  it('no castiga los primeros fallos', () => {
    expect(lockoutDelayMs(0)).toBe(0)
    expect(lockoutDelayMs(1)).toBe(0)
    expect(lockoutDelayMs(2)).toBe(0)
    expect(lockoutDelayMs(3)).toBe(0)
  })

  it('empieza a hacer esperar y crece con cada fallo', () => {
    expect(lockoutDelayMs(4)).toBeGreaterThan(0)
    expect(lockoutDelayMs(5)).toBeGreaterThan(lockoutDelayMs(4))
    expect(lockoutDelayMs(6)).toBeGreaterThan(lockoutDelayMs(5))
  })

  it('tiene tope de unos pocos minutos', () => {
    const cap = lockoutDelayMs(50)
    expect(cap).toBe(lockoutDelayMs(500))
    expect(cap).toBeLessThanOrEqual(10 * 60_000)
    expect(cap).toBeGreaterThanOrEqual(60_000)
  })

  it('trata las entradas raras como si no hubiera fallos', () => {
    expect(lockoutDelayMs(-3)).toBe(0)
    expect(lockoutDelayMs(Number.NaN)).toBe(0)
    expect(lockoutDelayMs(undefined as unknown as number)).toBe(0)
    expect(lockoutDelayMs('7' as unknown as number)).toBe(0)
  })
})
