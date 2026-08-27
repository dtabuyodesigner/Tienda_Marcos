// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_MAX_SIDE, AVATAR_MIME, AVATAR_QUALITY, fitWithin, shrinkImageFile } from './image'

describe('fitWithin', () => {
  it('reduce una imagen apaisada manteniendo la proporcion', () => {
    expect(fitWithin(800, 600, 320)).toEqual({ width: 320, height: 240 })
    expect(fitWithin(1600, 900, 320)).toEqual({ width: 320, height: 180 })
  })

  it('reduce una imagen vertical manteniendo la proporcion', () => {
    expect(fitWithin(600, 800, 320)).toEqual({ width: 240, height: 320 })
    expect(fitWithin(1080, 1920, 320)).toEqual({ width: 180, height: 320 })
  })

  it('reduce una imagen cuadrada a un cuadrado', () => {
    expect(fitWithin(2000, 2000, 320)).toEqual({ width: 320, height: 320 })
  })

  it('nunca amplia una imagen ya pequeña', () => {
    expect(fitWithin(200, 150, 320)).toEqual({ width: 200, height: 150 })
    expect(fitWithin(1, 1, 320)).toEqual({ width: 1, height: 1 })
  })

  it('deja intacta la imagen que esta justo en el limite', () => {
    expect(fitWithin(320, 320, 320)).toEqual({ width: 320, height: 320 })
    expect(fitWithin(320, 240, 320)).toEqual({ width: 320, height: 240 })
  })

  it('recorta en cuanto se pasa un solo pixel del limite', () => {
    expect(fitWithin(321, 240, 320)).toEqual({ width: 320, height: 239 })
    expect(fitWithin(320, 321, 320)).toEqual({ width: 319, height: 320 })
  })

  it('garantiza un minimo de 1 pixel con proporciones extremas', () => {
    expect(fitWithin(4000, 10, 320)).toEqual({ width: 320, height: 1 })
    expect(fitWithin(4000, 4, 320)).toEqual({ width: 320, height: 1 })
    expect(fitWithin(10, 4000, 320)).toEqual({ width: 1, height: 320 })
  })

  it('devuelve ceros ante entradas invalidas en vez de lanzar', () => {
    expect(fitWithin(0, 100, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(100, 0, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(-800, 600, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(800, -600, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(NaN, 600, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(800, Infinity, 320)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(800, 600, 0)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(800, 600, NaN)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(800, 600, -320)).toEqual({ width: 0, height: 0 })
  })
})

function fakeFile(): File {
  return new File(['foto'], 'cliente.jpg', { type: 'image/jpeg' })
}

function stubBitmap(width: number, height: number): { close: ReturnType<typeof vi.fn> } {
  const bitmap = { width, height, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  return bitmap
}

function stubContext(context: CanvasRenderingContext2D | null) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context)
}

function fakeContext(): { context: CanvasRenderingContext2D; drawImage: ReturnType<typeof vi.fn> } {
  const drawImage = vi.fn()
  return { context: { drawImage } as unknown as CanvasRenderingContext2D, drawImage }
}

describe('shrinkImageFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('devuelve el fichero original si no hay contexto 2d disponible', async () => {
    const file = fakeFile()
    stubBitmap(1200, 800)
    stubContext(null)

    await expect(shrinkImageFile(file)).resolves.toBe(file)
  })

  it('devuelve el fichero original si toBlob no produce nada', async () => {
    const file = fakeFile()
    stubBitmap(1200, 800)
    stubContext(fakeContext().context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await expect(shrinkImageFile(file)).resolves.toBe(file)
  })

  it('devuelve el blob comprimido con el mime y la calidad de avatar', async () => {
    const file = fakeFile()
    const bitmap = stubBitmap(1200, 800)
    const { context, drawImage } = fakeContext()
    stubContext(context)
    const compressed = new Blob(['pequena'], { type: AVATAR_MIME })
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(compressed))

    await expect(shrinkImageFile(file)).resolves.toBe(compressed)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), AVATAR_MIME, AVATAR_QUALITY)
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, AVATAR_MAX_SIDE, 213)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('devuelve el fichero original si no se puede decodificar la imagen', async () => {
    const file = fakeFile()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('formato no soportado')
      }),
    )

    await expect(shrinkImageFile(file)).resolves.toBe(file)
  })
})
