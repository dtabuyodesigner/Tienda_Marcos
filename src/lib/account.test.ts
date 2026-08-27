import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordProblem } from './account'

describe('reglas de contraseña de Cuenta', () => {
  it('exige una longitud minima razonable', () => {
    expect(passwordProblem('ab1', 'ab1')).toContain(`${MIN_PASSWORD_LENGTH} caracteres`)
    expect(passwordProblem('marcos1', 'marcos1')).toContain(`${MIN_PASSWORD_LENGTH} caracteres`)
  })

  it('exige letras y numeros', () => {
    expect(passwordProblem('marcostienda', 'marcostienda')).toBe('La contraseña debe incluir al menos una letra y un número.')
    expect(passwordProblem('12345678', '12345678')).toBe('La contraseña debe incluir al menos una letra y un número.')
  })

  it('exige que las dos contraseñas coincidan', () => {
    expect(passwordProblem('libreta2026', 'libreta2027')).toBe('Las contraseñas no coinciden.')
  })

  it('acepta una contraseña valida y repetida igual', () => {
    expect(passwordProblem('libreta2026', 'libreta2026')).toBeNull()
    expect(passwordProblem('sanmigueL9', 'sanmigueL9')).toBeNull()
  })
})
