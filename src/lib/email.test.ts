import { describe, expect, it } from 'vitest'
import { emailProblem, normalizeEmail } from './email'

describe('normalizeEmail', () => {
  it('trata la ausencia de email como algo normal, no como un error', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(normalizeEmail(empty)).toBeNull()
      expect(emailProblem(empty)).toBeNull()
    }
  })

  it('conserva un email normal', () => {
    expect(normalizeEmail('marcos@tienda.es')).toBe('marcos@tienda.es')
  })

  it('recorta espacios y pasa a minusculas', () => {
    expect(normalizeEmail('  Marcos@Tienda.ES  ')).toBe('marcos@tienda.es')
  })

  it('limpia espacios interiores pegados desde el movil', () => {
    expect(normalizeEmail('marcos @tienda.es\n')).toBe('marcos@tienda.es')
  })
})

describe('emailProblem', () => {
  it('acepta direcciones validas variadas', () => {
    const valid = [
      'marcos+fiados@tienda.es',
      'maria.jose.lopez@gmail.com',
      'pedro@correo.tienda.es',
      'ana@bar.io',
      'luis@mi-tienda-de-barrio.info',
    ]
    for (const email of valid) expect(emailProblem(email)).toBeNull()
  })

  it('rechaza direcciones sin arroba o con varias', () => {
    expect(emailProblem('marcostienda.es')).not.toBeNull()
    expect(emailProblem('marcos@@tienda.es')).not.toBeNull()
    expect(emailProblem('marcos@tienda@es.com')).not.toBeNull()
  })

  it('rechaza si falta la parte local o el dominio', () => {
    expect(emailProblem('@tienda.es')).not.toBeNull()
    expect(emailProblem('marcos@')).not.toBeNull()
  })

  it('rechaza un espacio en medio de la direccion', () => {
    expect(emailProblem('marcos perez@tienda.es')).not.toBeNull()
  })

  it('rechaza dominios mal formados', () => {
    expect(emailProblem('marcos@tienda')).not.toBeNull()
    expect(emailProblem('marcos@.tienda.es')).not.toBeNull()
    expect(emailProblem('marcos@tienda.es.')).not.toBeNull()
    expect(emailProblem('marcos@tienda..es')).not.toBeNull()
  })

  it('rechaza puntos mal colocados en la parte local', () => {
    expect(emailProblem('.marcos@tienda.es')).not.toBeNull()
    expect(emailProblem('marcos.@tienda.es')).not.toBeNull()
    expect(emailProblem('mar..cos@tienda.es')).not.toBeNull()
  })

  it('rechaza direcciones mas largas de 254 caracteres', () => {
    const tooLong = `${'a'.repeat(250)}@tienda.es`
    expect(tooLong.length).toBeGreaterThan(254)
    expect(emailProblem(tooLong)).toMatch(/demasiado largo/)
  })

  it('devuelve un mensaje legible en espanol, no un codigo', () => {
    const message = emailProblem('marcostienda.es')
    expect(message).toBe('Revisa el email: no parece una dirección válida.')
  })
})
