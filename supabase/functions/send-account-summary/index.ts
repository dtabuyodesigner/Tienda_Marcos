// Envia por email a UN cliente el resumen de su cuenta.
//
// Lo dispara a mano el duenno de la tienda desde la aplicacion. No hay envios
// automaticos, ni recordatorios, ni campanas.
//
// Contrato de confianza: del navegador solo se acepta `client_id`. Ni el email,
// ni el nombre, ni el saldo, ni los movimientos. Todo lo que sale en el correo
// se lee aqui de la base de datos, y se lee con la clave anonima mas el JWT del
// usuario, asi que pasa por RLS. Un usuario de la tienda A que adivine el uuid
// de un cliente de la tienda B recibe cero filas: no hay nada que filtrar.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildAccountSummary } from '../_shared/account-summary.ts'
import type { SummaryPayment, SummaryTicket } from '../_shared/account-summary.ts'
import { renderAccountEmail } from './email.ts'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const BREVO_TIMEOUT_MS = 10_000
const RESEND_WINDOW_SECONDS = 60
const DEFAULT_FROM_NAME = 'La Libreta de Marcos'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type ErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'no_email'
  | 'email_not_configured'
  | 'send_failed'
  | 'bad_request'
  | 'rate_limited'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** El `message` lo lee una persona no tecnica: nada de codigos ni jerga. */
function fail(status: number, code: ErrorCode, message: string): Response {
  return json(status, { ok: false, code, message })
}

async function readClientId(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  // Del cuerpo solo se mira esta clave; cualquier otro campo se ignora.
  const value = (body as Record<string, unknown>).client_id
  return typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim() : null
}

async function sendWithBrevo(
  apiKey: string,
  from: { email: string; name: string },
  to: { email: string; name: string },
  email: { subject: string; html: string; text: string },
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: from.email, name: from.name },
        to: [{ email: to.email, name: to.name }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
      signal: controller.signal,
    })
  } catch {
    // Ni la excepcion ni la peticion se registran: llevan la clave y el correo.
    return fail(502, 'send_failed', 'No se ha podido enviar el correo. Vuelve a intentarlo en un momento.')
  } finally {
    clearTimeout(timer)
  }

  if (response.ok) {
    // El cuerpo trae solo el messageId, pero no se usa ni se guarda.
    await response.body?.cancel()
    return null
  }

  // Solo el codigo de estado. El cuerpo puede repetir datos del envio.
  console.error('brevo rechazo el envio', response.status)
  await response.body?.cancel()

  if (response.status === 429) {
    return fail(429, 'rate_limited', 'Se han enviado demasiados correos seguidos. Espera unos minutos y vuelve a intentarlo.')
  }
  if (response.status === 401 || response.status === 403) {
    return fail(500, 'email_not_configured', 'El envío de correos no está bien configurado. Avisa a quien lleva la aplicación.')
  }
  return fail(502, 'send_failed', 'No se ha podido enviar el correo. Vuelve a intentarlo en un momento.')
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return fail(405, 'bad_request', 'La petición no es válida.')
  }

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return fail(401, 'unauthorized', 'Tu sesión ha caducado. Vuelve a entrar y prueba otra vez.')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return fail(500, 'email_not_configured', 'El envío de correos no está bien configurado. Avisa a quien lleva la aplicación.')
  }

  // Clave anonima + el JWT del usuario: toda lectura de aqui abajo pasa por RLS.
  // Nunca se usa la clave de servicio; con ella el filtro por tienda dependeria
  // de que no se olvide un `.eq('store_id', ...)`, y aqui lo garantiza Postgres.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // El token va explicito: aqui no hay sesion guardada de la que sacarlo, y
  // `getUser()` a secas fallaria siempre.
  const { data: userData, error: userError } = await supabase.auth.getUser(authorization.slice(7).trim())
  const user = userData?.user
  if (userError || !user) {
    return fail(401, 'unauthorized', 'Tu sesión ha caducado. Vuelve a entrar y prueba otra vez.')
  }

  const clientId = await readClientId(request)
  if (!clientId) {
    return fail(400, 'bad_request', 'No se ha indicado de qué cliente se quiere enviar la cuenta.')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return fail(401, 'unauthorized', 'Tu usuario no tiene ninguna tienda asociada.')
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, email, store_id')
    .eq('id', clientId)
    .maybeSingle()

  // Cinturon ademas del tirante de la RLS. Si el cliente fuese de otra tienda la
  // consulta ya habria devuelto nada; se responde igual que si no existiera para
  // no confirmar por la puerta de atras que ese uuid existe en alguna parte.
  if (clientError || !client || client.store_id !== profile.store_id) {
    return fail(404, 'not_found', 'No se ha encontrado ese cliente.')
  }

  const recipient = typeof client.email === 'string' ? client.email.trim() : ''
  if (!recipient) {
    return fail(400, 'no_email', 'Este cliente no tiene correo guardado. Añádeselo en su ficha y vuelve a intentarlo.')
  }

  // La configuracion se mira DESPUES de autorizar. Si se mirase antes, un intento
  // contra un cliente de otra tienda respondaria "falta configuracion" en vez de
  // "no existe": daria una pista al atacante y ademas haria imposible comprobar
  // que el aislamiento entre tiendas funciona mientras falte un secreto.
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const fromEmail = Deno.env.get('ACCOUNT_EMAIL_FROM')
  const fromName = Deno.env.get('ACCOUNT_EMAIL_FROM_NAME') || DEFAULT_FROM_NAME
  if (!apiKey || !fromEmail) {
    return fail(500, 'email_not_configured', 'Todavía no está configurado el envío de correos. Avisa a quien lleva la aplicación.')
  }

  const [ticketsResult, paymentsResult] = await Promise.all([
    supabase
      .from('tickets')
      .select('amount_cents, status, origin, concept, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true }),
    supabase
      .from('payments')
      .select('amount_cents, voided_at, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true }),
  ])

  if (ticketsResult.error || paymentsResult.error) {
    return fail(500, 'send_failed', 'No se ha podido preparar el resumen. Vuelve a intentarlo en un momento.')
  }

  // Rate limit server-side: el bloqueo del boton evita el doble click, pero no
  // evita que alguien dispare la funcion en bucle desde fuera de la aplicacion.
  // Reenviar mas tarde sigue siendo legitimo, asi que la ventana es corta.
  const since = new Date(Date.now() - RESEND_WINDOW_SECONDS * 1000).toISOString()
  const { data: recent } = await supabase
    .from('account_summary_sends')
    .select('id')
    .eq('client_id', clientId)
    .gte('created_at', since)
    .limit(1)
  if (recent && recent.length > 0) {
    return fail(429, 'rate_limited', 'Acabas de enviarle el resumen. Espera un momento antes de volver a enviarlo.')
  }

  const summary = buildAccountSummary(
    { clientName: client.name },
    (ticketsResult.data ?? []) as SummaryTicket[],
    (paymentsResult.data ?? []) as SummaryPayment[],
    new Date(),
  )

  const failure = await sendWithBrevo(
    apiKey,
    { email: fromEmail, name: fromName },
    { email: recipient, name: client.name },
    renderAccountEmail(summary),
  )
  if (failure) return failure

  // Queda constancia de que se envio: quien, a quien y cuando. Nunca el cuerpo
  // del correo ni una copia de los movimientos.
  const { error: auditError } = await supabase.from('account_summary_sends').insert({
    store_id: profile.store_id,
    client_id: clientId,
    sent_by: userData.user.id,
    channel: 'email',
    recipient,
  })
  // El correo ya salio: no se convierte un fallo de registro en un fallo de envio.
  if (auditError) console.error('no se pudo registrar el envio')

  return json(200, { ok: true, recipient })
})
