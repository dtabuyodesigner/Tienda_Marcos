import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordProblem, signUpMessage } from './account'

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

describe('mensajes de alta de cuenta', () => {
  it('explica que el email ya tiene cuenta', () => {
    expect(signUpMessage('User already registered')).toContain('ya tiene cuenta')
    expect(signUpMessage('Email address already been registered')).toContain('ya tiene cuenta')
  })

  it('apunta al codigo cuando el alta falla en base de datos', () => {
    expect(signUpMessage('Database error saving new user')).toContain('código de invitación')
  })

  it('traduce los mensajes reales del trigger de invitacion', () => {
    expect(signUpMessage('Se necesita un codigo de invitacion para crear una cuenta')).toBe('Necesitas un código de invitación para crear la cuenta.')
    expect(signUpMessage('Codigo de invitacion no valido o ya usado')).toBe('Ese código de invitación no es válido o ya se ha usado.')
  })

  it('traduce contraseña, email y limite de intentos', () => {
    expect(signUpMessage('Password should be at least 6 characters')).toContain('contraseña')
    expect(signUpMessage('Unable to validate email address')).toContain('email')
    expect(signUpMessage('Email address "x@example.com" is invalid')).toContain('email')
    expect(signUpMessage('For security purposes, rate limit exceeded')).toContain('intentos')
  })

  it('cae a un mensaje generico util si no reconoce el error', () => {
    expect(signUpMessage('something exploded')).toContain('conexión')
  })

  it('nunca devuelve el error crudo de Supabase', () => {
    for (const crudo of ['Database error saving new user', 'User already registered', 'whatever']) {
      expect(signUpMessage(crudo)).not.toContain(crudo)
    }
  })
})
