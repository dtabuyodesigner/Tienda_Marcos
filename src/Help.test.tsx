// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Help } from './Help'

// vitest sin `globals` no limpia el DOM entre pruebas: dos render dejarian dos cabeceras.
afterEach(cleanup)

describe('Help', () => {
  it('muestra el encabezado de la pantalla', () => {
    render(<Help onBack={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Ayuda' })).toBeDefined()
  })

  it('el botón Volver llama a onBack una sola vez', () => {
    const onBack = vi.fn()
    render(<Help onBack={onBack} />)
    screen.getByRole('button', { name: '← Volver' }).click()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('tiene al menos diez bloques desplegables', () => {
    const { container } = render(<Help onBack={() => {}} />)
    expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(10)
  })

  it('cada bloque desplegable tiene su pregunta visible', () => {
    const { container } = render(<Help onBack={() => {}} />)
    const bloques = Array.from(container.querySelectorAll('details'))
    expect(bloques.length).toBeGreaterThan(0)
    for (const bloque of bloques) {
      expect(bloque.classList.contains('help-item')).toBe(true)
      const pregunta = bloque.querySelector('summary')
      expect(pregunta).not.toBeNull()
      expect((pregunta?.textContent ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['crear un cliente', /cliente/i],
    ['apodo para buscar', /apodo/i],
    ['apuntar una compra', /apuntar (una )?compra|compra fiada/i],
    ['foto del ticket', /foto.*ticket|ticket.*foto/i],
    ['cobrar el total', /paga todo/i],
    ['cobrar una parte', /paga una parte/i],
    ['corregir con anulación', /anul/i],
    ['saldo anterior', /saldo anterior/i],
    ['ver la cuenta y el historial', /ver cuenta|historial/i],
    ['contraseña olvidada', /olvidado tu contraseña/i],
    ['cambiar la contraseña', /cambi\w* la contraseña/i],
    ['sin Internet', /internet/i],
  ])('cubre el tema: %s', (_tema, patron) => {
    const { container } = render(<Help onBack={() => {}} />)
    expect(container.textContent ?? '').toMatch(patron)
  })

  it('incluye los casos reales de mostrador', () => {
    const { container } = render(<Help onBack={() => {}} />)
    const texto = container.textContent ?? ''
    expect(texto).toMatch(/Pedrito/)
    expect(texto).toMatch(/20/)
    expect(texto).toMatch(/48/)
    expect(texto).toMatch(/18/)
    expect(texto).toMatch(/86,40/)
  })

  it('no usa jerga técnica en el texto visible', () => {
    const { container } = render(<Help onBack={() => {}} />)
    const texto = container.textContent ?? ''
    expect(texto).not.toMatch(/RLS|signed URL|PostgreSQL|Supabase|Storage|UUID|bucket|endpoint/i)
  })
})
