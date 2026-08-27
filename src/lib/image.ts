export const AVATAR_MAX_SIDE = 320
export const AVATAR_QUALITY = 0.8
export const AVATAR_MIME = 'image/jpeg'

/** Encaja unas dimensiones dentro de un cuadrado de `maxSide` sin ampliar nunca ni deformar. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!isPositiveFinite(width) || !isPositiveFinite(height) || !isPositiveFinite(maxSide)) return { width: 0, height: 0 }
  if (width <= maxSide && height <= maxSide) return { width, height }
  // Fijamos el lado mayor a maxSide en vez de multiplicar por una escala: evita que el redondeo lo deje en 319.
  return width >= height
    ? { width: maxSide, height: atLeastOne(Math.round((height * maxSide) / width)) }
    : { width: atLeastOne(Math.round((width * maxSide) / height)), height: maxSide }
}

/**
 * Reduce una foto en el navegador antes de subirla a Storage.
 * Comprimir es una mejora, no un requisito: ante cualquier fallo devuelve el fichero original
 * para no bloquear al usuario por no poder rasterizar.
 */
export async function shrinkImageFile(file: File, maxSide = AVATAR_MAX_SIDE): Promise<Blob> {
  let objectUrl: string | null = null
  let bitmap: ImageBitmap | null = null
  try {
    let source: CanvasImageSource
    let width: number
    let height: number
    if (typeof globalThis.createImageBitmap === 'function') {
      bitmap = await globalThis.createImageBitmap(file)
      source = bitmap
      width = bitmap.width
      height = bitmap.height
    } else {
      objectUrl = URL.createObjectURL(file)
      const image = await loadImage(objectUrl)
      source = image
      width = image.naturalWidth || image.width
      height = image.naturalHeight || image.height
    }

    const size = fitWithin(width, height, maxSide)
    if (size.width === 0 || size.height === 0) return file

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
    if (!context) return file
    context.drawImage(source, 0, 0, size.width, size.height)

    const blob = await canvasToBlob(canvas)
    return blob ?? file
  } catch {
    return file
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function atLeastOne(value: number): number {
  return value < 1 ? 1 : value
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se ha podido leer la imagen.'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => resolve(blob), AVATAR_MIME, AVATAR_QUALITY)
  })
}
