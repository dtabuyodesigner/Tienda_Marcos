export const MIN_PASSWORD_LENGTH = 8

/**
 * Reglas de contrasena para el cambio desde `Cuenta`.
 * Devuelve el mensaje de error listo para mostrar, o null si la contrasena es aceptable.
 * No registra ni almacena la contrasena en ningun sitio.
 */
export function passwordProblem(password: string, repeated: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (!/\p{Letter}/u.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir al menos una letra y un número.'
  if (password !== repeated) return 'Las contraseñas no coinciden.'
  return null
}
