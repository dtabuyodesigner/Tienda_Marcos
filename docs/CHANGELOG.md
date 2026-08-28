# Changelog

## Pendiente - Envio de resumen por email validado de extremo a extremo

Prueba real contra produccion el 28 de agosto de 2026, con tienda, tendero y cliente ficticios:

- La Edge Function devuelve `ok: true` y Brevo acepta el envio.
- El correo llega a la bandeja: asunto `Tu cuenta — La Libreta de Marcos`, destinatario correcto, compra de 30,00 EUR, pago de -10,00 EUR, `Pendiente actual: 20,00 €` y `Pendiente desde hoy`.
- Privacidad verificada sobre el mensaje entregado: sin nota privada, sin apodo, sin telefono, sin identificadores y sin rutas de fichero.
- `account_summary_sends` registro un unico envio con su traza completa y sin el cuerpo del correo.
- Datos de prueba eliminados: mismos recuentos que antes y cero residuos.

Lo que desbloqueo el envio fue la configuracion en Brevo: una clave de API v3 valida y un remitente verificado. No hubo ningun cambio de codigo.

## Pendiente - Ajustes de redaccion

- La nota del `Resumen` de la ficha mostraba comillas invertidas literales en pantalla.
- Una deuda del mismo dia decia `Pendiente desde hace 0 días`, que no es castellano. Ahora dice `Pendiente desde hoy`, y `Pendiente desde hoy o antes` cuando nace de un saldo anterior, para no perder la semantica de cota inferior sin sonar artificial.
- La frase vive en el modelo canonico, asi que pantalla, PDF, WhatsApp y email dicen exactamente lo mismo.

## Pendiente - Diagnostico del envio por email

- La Edge Function devuelve ahora `upstreamStatus` con el codigo HTTP del proveedor de correo cuando el envio falla. Sin ese dato no habia forma de distinguir una clave rechazada de un remitente no verificado sin mirar la clave, que es justo lo que no se puede hacer. Nunca se devuelve la clave ni el cuerpo de la respuesta del proveedor.
- Prueba de extremo a extremo desde produccion: todo el camino funciona hasta el envio; Brevo responde 401 y rechaza la clave. Detalle en `docs/PENDIENTES.md`.

## Pendiente - Compartir la cuenta: email, PDF y WhatsApp

Base: `5bb1b3aecd44a38216cda8e65c5669fc4605e3cd`.

### Modelo canonico

- `supabase/functions/_shared/account-summary.ts`: unica implementacion del calculo economico compartible, sin imports para que la carguen igual Vite y Deno. `src/lib/aging.ts` pasa a ser un reexport suyo, asi que el FIFO existe una sola vez.

### Compartir

- Accion `Compartir cuenta` en `Ver cuenta`, con menu de email, WhatsApp y PDF. Accesible, tactil, y se cierra con Escape, pulsando fuera o al elegir.
- PDF A4 con `jsPDF` cargado bajo demanda, con paginacion y nombre de fichero seguro.
- WhatsApp con texto preparado por `wa.me`, con o sin telefono. No envia nada solo.

### Email server-side

- Edge Function `send-account-summary` desplegada. El navegador manda solo `client_id`; el destinatario, el saldo y los movimientos se resuelven en el servidor bajo RLS, sin service role.
- Brevo como proveedor transaccional, con `fetch` nativo y timeout. Secretos server-side, nunca en el frontend.
- Tabla `account_summary_sends` con RLS: traza del envio y limite de reenvio de 60 segundos.
- Corregido durante la integracion el orden de comprobaciones: autorizar antes que mirar la configuracion.

### Correcciones

- `supabase/config.toml` usaba la forma antigua de declarar buckets, que hacia fallar cualquier comando del CLI que validase el config entero.

### Validacion

- 257 pruebas en verde.
- Autorizacion comprobada contra la funcion desplegada: cross-store rechazado.
- PDF real inspeccionado con `pdfinfo` y `pdftotext`.
- Envio real de correo: **no realizado**, falta `BREVO_API_KEY`.

## Pendiente - Antiguedad FIFO, avisos, resumen global y email del cliente

Base: `9f4e2b73e2446dfbb362041b635ac6fb545a6759`.

### Antiguedad de deuda

- Nuevo modulo puro `src/lib/aging.ts`: imputa los pagos a la deuda mas antigua primero, de modo que una compra nueva no rejuvenece una deuda anterior que sigue viva.
- Calculo derivado, sin persistir imputaciones: anular un pago o un ticket rehace el resultado solo.
- Dias naturales en `Europe/Madrid`, comparando fechas civiles, no restando horas.
- El saldo anterior se presenta como cota inferior (`al menos X días`) porque su fecha es la de registro, no la real.

### Avisos

- Aviso en Inicio cuando hay cuentas que llevan mas de 7 dias, con nombre, saldo y antiguedad, y `Ver todas` hacia el Resumen.
- Marca discreta en la ficha del cliente. Sin etiquetas de moroso ni scoring, con una prueba que falla si aparecen.
- Umbral en una sola constante.

### Resumen global

- Nueva pantalla `Resumen` en el menu de usuario: pendiente total, clientes con deuda, cuentas y deuda de mas de 7 dias, compras y cobros del mes, y las cinco cuentas mas antiguas.
- La deuda de mas de 7 dias cuenta solo los tramos viejos, no el saldo entero de esas cuentas.

### Email del cliente

- Migracion `202608270006_add_client_email.sql`: `clients.email` opcional, sin indice porque no se busca por email.
- Campo en el alta y edicion desde la ficha, con normalizacion y validacion de formato permisiva.
- No se envia nada: es solo un dato de contacto para un envio manual futuro.

### Modelo unico de Ver cuenta

- Nuevo `src/lib/account-view.ts`, compartible por construccion: sin identificadores tecnicos, sin nota privada y sin apodo, para que reutilizarlo en email, PDF o WhatsApp no exija acordarse de filtrar nada.

### Rendimiento

- El panel ya traia los movimientos vivos de la tienda en una sola carga; ahora se reutilizan para antiguedad y resumen. Ninguna consulta nueva por cliente.

### Validacion

- 214 pruebas en verde.
- Migracion aplicada en `Marcos_Tienda` con los datos previos intactos.

## Pendiente - Onboarding real validado de extremo a extremo

Base: `7450ae509d6a39a64e9a8c4ae2fed9c842727442`.

### Correo saliente

- SMTP propio de Brevo configurado en el panel y **validado con un alta real**: el correo de confirmacion sale por Brevo y llega a la bandeja.
- Site URL y Redirect URL correctas: el enlace del correo pasa por Supabase y termina en `https://marcos-tienda.vercel.app` con sesion.

### Alta real de extremo a extremo

Recorrido completo contra produccion y `Marcos_Tienda`, con una invitacion de un solo uso emitida para la ocasion:

- alta con nombre, email, contrasena, tienda y codigo: aceptada, sin sesion inmediata y con aviso de confirmacion;
- correo entregado por Brevo, enlace seguido hasta el dominio publico;
- login posterior con sesion y usuario confirmado;
- una sola tienda y un solo perfil, con rol `owner`;
- tienda vacia y sin acceso a datos de otras tiendas, comprobado con la sesion real contra la API;
- `store_invites` no legible ni por anonimo ni por autenticado;
- reutilizar la invitacion, registrarse sin codigo y con codigo inventado fallan los tres;
- datos de prueba eliminados despues: mismos recuentos que antes y cero residuos.

### Plantillas de correo

- Anadido `docs/EMAIL_TEMPLATES.md` con asunto y cuerpo en espanol para confirmacion de cuenta y recuperacion de contrasena, mas el criterio de que hacer con el resto de plantillas.
- Estado: pendiente de pegar en el panel. Hoy el correo llega en ingles.

### Pendientes

- Nuevo P1: `Email del cliente + envio manual de resumen de cuenta`. No implementado.

## Pendiente - P1 Onboarding controlado y Ayuda

Base: `2d4d3c6ebcd63827efe256f58dcf6e8580fa47d9`.

### Registro controlado

- Migracion `202608270005_add_store_invites.sql`, aplicada en `Marcos_Tienda`: tabla `store_invites` con RLS y sin politicas, funciones `invite_code_hash`, `issue_store_invite` e `invite_is_available`, y nueva version de `handle_new_user` que consume la invitacion en la misma transaccion que crea el usuario.
- `Crear mi cuenta` en la pantalla de acceso, sin perder login ni recuperacion de contrasena.
- Alta con nombre, email, contrasena repetida, nombre de tienda y codigo. Crea tienda y perfil con rol `owner`.
- Del codigo solo se guarda su hash. No hay ningun codigo en el frontend ni en el paquete publicado.
- Confirmado contra el proyecto real que Auth exige verificar el email; la pantalla lo dice en vez de fingir que ya se entra.

### Ayuda

- Pantalla `Ayuda` en el menu de usuario, entre `Cuenta` y `Cerrar sesión`, con 14 preguntas de mostrador en bloques desplegables y sin jerga tecnica.
- Es contenido estatico: se lee sin pedir nada al servidor.
- Ayudas contextuales anadidas en foto del ticket y anulacion; las de saldo anterior y cambio de contrasena ya existian.

### Validacion

- 146 pruebas en verde.
- Remoto: 14 comprobaciones de seguridad del registro y prueba por la API real de Auth.

## Pendiente - P1 Foto y resumen del cliente

Base: `b521e4f7bd783187d60cf40ae3f923613a77ba63`.

### Foto del cliente

- Migracion `202608270004_add_client_photo.sql`: columna `clients.photo_path` y `check` que obliga a que la ruta viva bajo la tienda del cliente. Aplicada en `Marcos_Tienda`.
- Storage: se reutiliza el bucket privado `ticket-photos` con prefijo `<store_id>/client-photos/<client_id>/`. Cero politicas nuevas.
- Foto opcional en el alta, que nunca bloquea la creacion del cliente; si falla la subida se avisa y se reintenta desde la ficha.
- Anadir, cambiar y quitar foto desde la ficha. Quitar la foto no toca al cliente ni su historial.
- Avatar con foto en Inicio, seleccion de cliente, compra, saldo anterior, ficha, Historial y Ver cuenta; inicial como fallback y tambien si la imagen no carga.
- Reduccion en el navegador a 320 px de lado mayor, JPEG calidad 0,8, antes de subir.
- Signed URLs de una hora renovadas en cada carga del panel.

### Resumen de la ficha

- Seccion `Resumen` con movimientos de deuda activos, ultima compra, ultimo pago, total apuntado, total pagado y movimientos registrados.
- Definiciones explicitas en la propia pantalla y en `docs/DECISIONES.md`.
- `Antiguedad de la deuda` queda fuera a proposito: sigue como P1 con imputacion FIFO pendiente.

### Validacion

- 106 pruebas en verde, incluidas las de foto y las del modulo de resumen.
- Validacion remota contra `Marcos_Tienda`: datos previos intactos y 8 comprobaciones de seguridad de Storage en verde, en transaccion revertida.

## `2b15faa475ee81a3cc30fd8d196faef52a5b7a2a` - P1 Migracion inicial de saldos desde papel

Base: `05fc2ac211402a1549b25b37bdbca0ac5f38d089`. Estado: resuelto y validado contra `Marcos_Tienda`.

### Estado de migraciones en Marcos_Tienda

- `202608270002_add_client_reference_fields.sql` y `202608270003_add_movement_origin.sql` aplicadas en el proyecto real.
- `supabase migration list --linked` devuelve 0001, 0002 y 0003 presentes en local y remoto.
- `supabase db push --dry-run` devuelve `Remote database is up to date`.
- Verificado sobre el proyecto real: 18 comprobaciones en verde con datos ficticios en transaccion revertida, sin residuo. Los 4 tickets previos quedaron en `origin = 'purchase'`, la deuda total sigue en 9.700 centimos y `max(updated_at)` de tickets no se movio.

### Modelo de datos

- Nueva migracion versionada `202608270003_add_movement_origin.sql`. No se modifica ninguna migracion anterior.
- Anadido el tipo `public.movement_origin` (`purchase` | `opening_balance`) y la columna `tickets.origin`, con default `purchase` para las filas ya existentes.
- Constraint que impide adjuntar foto de ticket a un saldo anterior.
- Indice unico parcial que impide dos saldos anteriores vivos del mismo cliente.
- Trigger `protect_ticket_origin`: el origen no se puede reescribir tras crear el movimiento.

### Funcionalidad

- Accion secundaria `Añadir saldo anterior` en la ficha de cliente, con importe obligatorio, nota opcional y texto explicativo.
- Confirmacion previa con el importe, que reutiliza el aviso de importe alto en el mismo dialogo.
- Aviso posterior `✓ Saldo anterior añadido` con el saldo actualizado.
- Proteccion frente a doble envio en interfaz y en base de datos.
- El historial distingue `Saldo anterior` de `Compra` y no lo presenta como una compra hecha ese dia: la fecha se etiqueta como registro.
- La anulacion reutiliza la trazabilidad existente y descuenta el importe del saldo.
- La accion desaparece de la ficha cuando el cliente ya tiene un saldo anterior vivo.
- La aplicacion detecta al cargar si el esquema soporta `origin`; mientras la migracion no este aplicada, la accion no se ofrece en lugar de fallar.

### Tests

- 54 pruebas en verde: aritmetica de saldo con saldo anterior sobre cero y sobre deuda existente, anulacion y saldo resultante, rechazo de importe cero y negativo, doble submit, rechazo de duplicado por base de datos, y representacion diferenciada en historial.
- pgTAP ampliado a 13 asserts con origen, unicidad, inmutabilidad y anulacion. No ejecutable en este entorno por falta de Docker.

## `768487a6af929f6cf21f898b3df04f03a892f84f` - Cierre Fase 3B Subtrabajo 2

Base: `ab12c75b29c8213f009fb1ea3de5f180df035a91`. Se despliega en produccion automaticamente al hacer push a `master`.

### Cuenta

- La pantalla `Cuenta` ya no muestra el campo de contrasena nueva al entrar: primero aparece la accion secundaria `Cambiar contraseña`.
- Cambiar la contrasena exige reautenticacion con la contrasena actual, validada contra Supabase Auth.
- Tras reautenticar se piden `Nueva contraseña` y `Repetir nueva contraseña`, con validacion de coincidencia y minimo de 8 caracteres con letras y numeros.
- Anadida salida `He olvidado mi contraseña` que reutiliza el flujo de recuperacion de Supabase ya existente.
- `✓ Contraseña actualizada` solo se muestra tras confirmacion real de Supabase.
- Corregido el layout de `Email de acceso`: label y correo dejan de aparecer pegados; el email va debajo, con espaciado propio y corte de linea correcto en movil.
- `Cerrar sesión` se mantiene.

### Identidad e Inicio

- La cabecera sustituye `Hoy, con calma.` por `Covirán · San Miguel de las Dueñas · El Bierzo · León`, con jerarquia secundaria y wrap en movil.
- `+ Apuntar compra` y `Nuevo cliente` quedan alineados en el eje derecho en movil y escritorio.

### Correcciones de fiabilidad

- Si una compra o un cobro se guardan pero falla la lectura posterior del saldo, la aplicacion avisa en lugar de quedarse en silencio en el formulario.
- `Purchase` y `Charge` esperan de verdad al cierre de la operacion, cerrando la ventana en la que se podia registrar un segundo pago mientras se refrescaba el saldo.
- La pantalla de cobro no habilita `Paga todo` ni `Paga una parte` hasta conocer la deuda; si el cliente no debe nada, lo dice en vez de dejar botones que fallan.

### Verificado como ya existente en esta base

- Clientes recientes en `¿A quién se lo apuntamos?`, orden inteligente con deuda primero, tarjetas completas pulsables, confirmaciones de compra y de pago parcial/total, vista `Ver cuenta`, umbral de importe alto, apodo y nota opcionales, busqueda por nombre/apodo, seccion `Cuenta`, estados vacios, errores de conexion/guardado, foto del ticket con camara/selector y proteccion contra doble submit.
- `+ Nuevo cliente` desde la ficha, `Ver historial` como boton secundario y `Cobrar` oculto con saldo cero ya estaban implementados; en este tramo se consolidan con regla compartida y tests.

### Tests y documentacion

- Anadidos tests de interfaz con jsdom y Testing Library: ficha con saldo cero y con deuda, alta de cliente desde ficha y vuelta al cancelar, y la puerta de reautenticacion de `Cuenta`.
- Anadidas reglas puras `canChargeClient` y `passwordProblem` con sus tests.
- Documentacion actualizada: README, decisiones, pendientes y changelog.

- Añadidos clientes recientes en la pantalla `¿A quién se lo apuntamos?`.
- Añadido orden inteligente: deuda primero, actividad reciente despues y nombre como desempate.
- La fila completa del cliente es pulsable.
- Añadidas confirmaciones claras tras compra, pago parcial y pago total.
- Añadido cobro destacado desde ficha y oculto cuando el saldo es cero.
- Añadida vista `Ver cuenta`.
- Añadido umbral configurable para confirmar importes anormalmente altos.
- Añadidos apodo/referencia y nota corta opcionales de cliente.
- Añadida busqueda por nombre y apodo.
- Añadida seccion minima `Cuenta`: email, cambio de contrasena y cierre de sesion.
- Mejorados estados vacios y errores de conexion/guardado.
- Mejorada presentacion de `Foto del ticket` manteniendo camara/selector.
- Añadido `+ Nuevo cliente` desde la ficha de cliente; cancelar vuelve a la ficha anterior y guardar abre la ficha nueva.
- Convertido `Ver historial` en boton secundario tactil.
- Documentacion actualizada: README, arquitectura, seguridad, decisiones y pendientes.

## `1ecaf2a61d0728c9201b03467f8e7a2e2963d053` - Refinamiento Movil Y Password Recovery

- `Nuevo cliente` visible como boton secundario en inicio.
- `+ Nuevo cliente` movido arriba en seleccion de cliente.
- `Fotografía` cambiado a `Foto del ticket`.
- Input de foto compatible con camara movil y selector de escritorio.
- Recuperacion real de contrasena mediante Supabase Auth.
- PIN documentado como siguiente mejora, no implementado.

## `9ccc48abb552bcc88919ca3a364d639abb14d1cb` - Deploy PWA Fase 3

- Preparacion del deploy funcional en Vercel.
- Validacion de variables publicas y configuracion de PWA.

## `a2ea3b7bdfb0e803eed72958318edf7d40d54f3f` - MVP Fase 2

- Flujo funcional de clientes, tickets, pagos, fotos y anulaciones.
- Tests minimos de reglas economicas y Storage.
- Validacion contra `Marcos_Tienda`.

## `686297989df37d0fb696f4fe82783eef0b24301a` - Correccion Triggers

- Separacion de triggers de pertenencia/autoria segun forma real de tabla.

## `fee78c8` - Base Fase 1

- Fundacion React, Vite, TypeScript, PWA, Supabase Auth, PostgreSQL, RLS y Storage privado.
