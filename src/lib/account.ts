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

/**
 * Nombre para el control de usuario de la cabecera.
 * Prefiere `profiles.display_name`; si no existe, cae al usuario del email.
 */
export function accountDisplayName(displayName: string | null | undefined, email: string | null | undefined): string {
  const nombre = displayName?.trim()
  if (nombre) return nombre
  const local = email?.split('@')[0]?.trim()
  return local || 'Mi cuenta'
}

export function accountInitial(name: string): string {
  return (name.trim().charAt(0) || '?').toLocaleUpperCase('es-ES')
}

/**
 * Traduce el error de alta de Supabase Auth a algo que Marcos entienda.
 * El fallo del trigger de invitacion llega como error generico de base de datos,
 * asi que ese caso se explica apuntando al codigo, que es la causa probable.
 */
export function signUpMessage(raw: string): string {
  const text = raw.toLowerCase()
  // Comprobado contra el proyecto real: la excepcion del trigger de invitacion
  // llega literal a traves de Auth, no como error generico de base de datos.
  if (text.includes('se necesita un codigo de invitacion')) {
    return 'Necesitas un código de invitación para crear la cuenta.'
  }
  if (text.includes('codigo de invitacion no valido')) {
    return 'Ese código de invitación no es válido o ya se ha usado.'
  }
  if (text.includes('already registered') || text.includes('already been registered') || text.includes('user already')) {
    return 'Ese email ya tiene cuenta. Inicia sesión o recupera la contraseña.'
  }
  if (text.includes('database error') || text.includes('unexpected_failure')) {
    return 'No se pudo crear la cuenta. Revisa el código de invitación: puede que ya se haya usado.'
  }
  if (text.includes('password')) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres, con letras y números.`
  if (text.includes('is invalid') || text.includes('email')) return 'Revisa el email: Supabase no lo acepta como dirección válida.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.'
  return 'No se pudo crear la cuenta. Comprueba la conexión y vuelve a intentarlo.'
}
