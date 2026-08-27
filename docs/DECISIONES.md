# Decisiones

## Estado Del Proyecto

- Producto: `La Libreta de Marcos`, PWA para fiados de tienda.
- Proyecto Supabase: `Marcos_Tienda`.
- Deploy publico: `https://marcos-tienda.vercel.app`.
- SHA base de Fase 3B Subtrabajo 2: `ab12c75b29c8213f009fb1ea3de5f180df035a91`.
- SHA de cierre de Fase 3B Subtrabajo 2: `768487a6af929f6cf21f898b3df04f03a892f84f`.
- SHA del P1 de migracion de saldos: `2b15faa475ee81a3cc30fd8d196faef52a5b7a2a`.
- Migraciones aplicadas en `Marcos_Tienda`: `202608270001`, `202608270002` y `202608270003`. La base remota esta al dia.
- `master` es la rama desplegada automaticamente por Vercel: cada push a `master` genera un deployment de produccion. No hay promocion manual, asi que `master` solo debe recibir codigo que pase tests, TypeScript y build.

## Arquitectura

- Frontend React + Vite + TypeScript.
- Supabase Auth para identidad y sesion.
- PostgreSQL con RLS como frontera real de seguridad.
- Storage privado para fotos de tickets.
- Vercel para despliegue de la PWA.

## Dinero

- Todos los importes economicos se convierten a centimos enteros antes de guardar.
- No se usan floats para saldo ni movimientos.
- El saldo se deriva de tickets activos menos pagos no anulados.
- Tickets y pagos se anulan con trazabilidad; no se borran como operacion normal.
- Los importes anormalmente altos requieren confirmacion con umbral configurable en codigo.

## Saldo Anterior A La Libreta

- Marcos llega con deuda ya anotada en tickets de papel. Esa deuda entra como un unico movimiento por cliente, no como compras inventadas: no sabemos que compro ni cuando, y fabricar tickets falsos ensuciaria el historial para siempre.
- Modelo elegido: conservar el modelo economico actual y anadir `tickets.origin` (`purchase` | `opening_balance`) mediante la migracion versionada `202608270003_add_movement_origin.sql`.
- Por que no una tabla nueva: una tabla aparte obligaria a duplicar RLS, FKs compuestas, triggers de anulacion, indices y el calculo de saldo en dos sitios. El saldo anterior se comporta exactamente igual que un ticket (aumenta deuda, se anula con trazabilidad, se paga con los mismos pagos), asi que su unica diferencia real es semantica y se resuelve con una columna de origen.
- Por que no simularlo en frontend: el origen tiene que ser un dato verificable en base de datos. Un `concept` con el texto `Saldo anterior` seria una convencion que cualquiera puede romper y que no permite validar nada.
- Por que no una compra normal: una compra normal es una operacion de un dia concreto y puede llevar foto de ticket. El saldo anterior es deuda agregada sin fecha de compra real, por eso lleva su propio constraint que le prohibe foto y en la interfaz se titula `Saldo anterior` con la fecha etiquetada como registro, no como compra.
- Un cliente solo puede tener un saldo anterior vivo. Lo garantiza un indice unico parcial, no solo la interfaz: duplicar deuda por un doble envio es el error caro. Para corregir un importe se anula y se registra el correcto.
- El origen no se puede reescribir despues de crear el movimiento: trigger propio `protect_ticket_origin`, separado del compartido porque `payments` no tiene esa columna.
- La anulacion reutiliza la trazabilidad existente: quien anulo, cuando y por que, y el importe deja de contar en el saldo.
- `Añadir saldo anterior` es una accion secundaria de puesta en marcha. No compite con `+ Nueva compra` ni con `Cobrar`, y desaparece de la ficha cuando el cliente ya tiene un saldo anterior vivo.
- La sonda de esquema descrita abajo se mantiene aunque la migracion ya este aplicada: es barata, deja el orden de despliegue libre y protege ante un entorno futuro que aun no tenga la migracion.
- La aplicacion comprueba al cargar si el esquema ya tiene la columna `origin`. Si la migracion aun no esta aplicada, la accion no se ofrece en lugar de fallar al guardar. Asi el despliegue del frontend y la aplicacion de la migracion pueden ir en cualquier orden sin romper produccion.

## Seguridad

- El frontend no contiene service role key ni secretos.
- La anon key solo permite lo que RLS autoriza.
- Cada tabla de negocio lleva `store_id`.
- Las FKs compuestas impiden mezclar clientes y movimientos de tiendas distintas.
- El bucket `ticket-photos` es privado y las fotos se visualizan mediante signed URLs temporales.

## Flujo De Marcos

- Inicio muestra el total pendiente y acceso principal a `+ Apuntar compra`.
- Los clientes con deuda se muestran primero; despues aparecen clientes a cero.
- El criterio secundario es actividad economica reciente; si empata, nombre alfabetico.
- En `¿A quién se lo apuntamos?`, `+ Nuevo cliente` aparece antes del listado y se muestran clientes recientes.
- La fila completa del cliente es pulsable para uso tactil.
- La ficha del cliente concentra sus acciones: `+ Nueva compra`, `Cobrar` cuando hay deuda, `Ver cuenta`, `Ver historial` y `Añadir saldo anterior` cuando procede.
- Crear un cliente distinto no es una accion del cliente abierto. En la ficha se llama `+ Crear otro cliente` y va en la cabecera, a la derecha del nombre del cliente, porque ahi se lee como `paso a otro cliente` y no como algo que se le hace al cliente abierto. En movil estrecho cae debajo del nombre. Mantiene jerarquia secundaria: no compite con `+ Nueva compra`. Tras el alta se confirma con `✓ <Nombre> creado correctamente` y se puede encadenar otra alta sin volver a Inicio.
- Si se crea un cliente desde una ficha, cancelar vuelve a la ficha anterior y guardar abre la ficha nueva.

## UX

- La ficha de cliente debe permitir encadenar tareas. Desde una ficha se puede crear otro cliente sin volver a Inicio: al guardar se abre la ficha del cliente nuevo y al cancelar se vuelve a la ficha anterior.
- Las acciones secundarias deben verse como botones tactiles, no como enlaces de texto. `Ver historial`, `Ver cuenta` y `+ Nuevo cliente` usan boton con fondo y borde propios, con jerarquia visual por debajo de `+ Nueva compra` y `Cobrar`.
- `+ Apuntar compra` y `+ Nueva compra` son acciones principales.
- `Nuevo cliente`, `Ver historial` y `Ver cuenta` mantienen jerarquia secundaria.
- `Cobrar` no aparece cuando el saldo es cero: no se ofrece una accion imposible. La regla vive en `canChargeClient` y se aplica tanto en la ficha como en la pantalla de cobro.
- La pantalla de cobro no habilita botones hasta conocer la deuda real, para no mostrar errores enganosos mientras carga.
- En Inicio, `+ Apuntar compra` y `Nuevo cliente` comparten eje derecho: la fila de la seccion usa el mismo canal interior que la tarjeta de total pendiente.
- La cabecera identifica la tienda concreta y su ubicacion (`Covirán · San Miguel de las Dueñas · El Bierzo · León`) por debajo del nombre de la aplicacion, con jerarquia secundaria y wrap permitido en movil.
- Las confirmaciones de compra, pago parcial, pago total y alta de cliente son explicitas y nombran al cliente.
- Toda pantalla que pertenece a un cliente concreto muestra su nombre. `Historial` y `Ver cuenta` lo encabezan con un resumen discreto del saldo (`Deuda actual: XX,XX €` o `No debe nada`). El nombre se toma siempre del cliente seleccionado, nunca de estado propio de la pantalla que pudiera quedar desincronizado.
- Los estados vacios usan lenguaje natural.
- Los errores de carga/guardado evitan mostrar falso exito.

## Navegacion Y Cabecera

- La cabecera se lee en dos lineas: `LA LIBRETA DE MARCOS` con el control de usuario a su derecha, y debajo `Covirán · San Miguel de las Dueñas · El Bierzo · León` a lo ancho. La ubicacion puede envolver sin estrechar el control.
- `Cuenta` y `Salir` dejan de ser dos enlaces sueltos. Motivo: `Salir` tenia demasiado protagonismo para ser la accion menos frecuente y mas destructiva de la aplicacion, y dos enlaces de texto hacian que la cabecera pareciese una pagina web en vez de la aplicacion de Marcos.
- En su lugar hay un unico control de usuario arriba a la derecha: avatar con la inicial, nombre y flecha. Abre un menu con `Cuenta` y `Cerrar sesión`.
- `Cerrar sesión` va separado visualmente del resto de opciones para que no se pulse por inercia, y usa exactamente el logout existente de Supabase Auth. Esta decision es de navegacion, no de Auth.
- El nombre sale de `profiles.display_name`, que ya se lee al cargar el panel, sin consultas nuevas. Si no hay nombre se usa el usuario del email y, en ultimo caso, `Mi cuenta`.
- El menu es propio, sin libreria: son dos opciones. Cumple `aria-haspopup`, `aria-expanded`, `role="menu"` y `role="menuitem"`, lleva el foco a la primera opcion al abrir, se recorre con flechas, y se cierra al elegir, al pulsar fuera y con Escape devolviendo el foco al control.
- En pantallas de menos de 380px el nombre se oculta visualmente y queda avatar mas flecha, pero el texto sigue en el arbol de accesibilidad para no dejar un boton sin nombre.
- `Ayuda` ira en este menu, entre `Cuenta` y `Cerrar sesión`, cuando la seccion exista. No se ha anadido ahora para no dejar un enlace muerto.

## Antiguedad De La Deuda (FIFO)

- La antiguedad de una cuenta es la del dinero que sigue sin pagarse, no la del ultimo movimiento. Una compra nueva no puede rejuvenecer una deuda anterior que sigue viva.
- Algoritmo: se ordenan los movimientos de deuda activos por fecha, se suman todos los pagos no anulados en un unico credito y se va consumiendo contra la deuda **de la mas antigua a la mas reciente**. Lo que queda vivo son los tramos, y el mas antiguo da la antiguedad de la cuenta.
- Ejemplo: compra de 20,00 EUR el 27 de julio, compra de 10,00 EUR el 25 de agosto, pago de 15,00 EUR. Quedan 5,00 EUR vivos del 27 de julio y 10,00 EUR del 25 de agosto. La cuenta arrastra deuda desde el 27 de julio.
- **Calculo derivado, sin estado nuevo.** No se persiste ninguna imputacion de pagos a tickets. Motivo: una imputacion guardada habria que rehacerla a mano cada vez que se anula un pago o un ticket, y una imputacion desincronizada es peor que no tenerla. Como todo sale de los movimientos vivos, anular un pago rehace el calculo solo.
- Los movimientos anulados no existen para este calculo, ni los tickets ni los pagos.
- El dia es el **dia natural en `Europe/Madrid`**, comparando fechas civiles, no restando horas. Asi `7 dias` significa lo mismo a las 9:00 que a las 23:00, y el cambio de hora no descuadra nada.
- El calculo vive en `src/lib/aging.ts`, es puro y no toca red ni entorno.

## Aviso De Cuentas Antiguas

- Umbral inicial: **7 dias**, en la constante `OVERDUE_THRESHOLD_DAYS` de `src/lib/aging.ts`. Se cambia ahi y en ningun otro sitio: la interfaz y el resumen leen esa constante.
- La regla es **estrictamente mas de** el umbral, porque el texto dice `llevan más de 7 días`. A los 7 dias todavia no avisa; a los 8 si.
- El aviso solo aparece si hay cuentas que lo superan. Nada de bloques vacios.
- En Inicio se muestran como mucho tres, con nombre, saldo y antiguedad, y `Ver todas` lleva al Resumen cuando hay mas.
- **No hay scoring ni etiquetas.** Nunca se dice moroso, mal pagador, riesgo ni cliente problematico. Solo el hecho objetivo: cuanto debe y desde cuando. Hay una prueba que falla si aparece alguna de esas palabras.

## Saldo Anterior Y Antiguedad

- La fecha de un saldo anterior es la del dia en que Marcos lo apunto, no el dia en que nacio la deuda. Presentarla como exacta seria inventarse una precision que no tenemos.
- Por eso, cuando el tramo vivo mas antiguo es un saldo anterior, se dice **`al menos X días`** en vez de `X días`. El modelo lo marca con `approximate`.
- Mejora futura documentada y NO implementada: un campo opcional `deuda desde` al registrar el saldo anterior, para quien recuerde la fecha real. No hace falta para presentar esto con honestidad, asi que no se adelanta.

## Resumen Global

- Pantalla `Resumen`, accesible desde el menu de usuario, con cifras y listas. Sin graficas: para esta tienda un numero claro vale mas que un panel.
- Definiciones exactas:
  - `Pendiente total`: suma de los saldos vivos de todos los clientes.
  - `Clientes con deuda`: clientes con saldo mayor que cero.
  - `Cuentas de mas de 7 dias`: cuentas cuyo tramo vivo mas antiguo pasa del umbral.
  - `Deuda de mas de 7 dias`: **solo los tramos** que llevan mas de ese tiempo sin pagarse, no el saldo entero de esas cuentas. Parte de ese saldo puede ser de ayer, y sumarlo entero exageraria la cifra.
  - `Compras fiadas` del mes: compras activas creadas en el mes civil en curso. Un saldo anterior NO cuenta como compra del mes aunque se apuntase este mes.
  - `Cobrado` del mes: pagos no anulados del mes civil en curso. Un pago anulado no cuenta como cobrado.
- El mes civil se calcula tambien en `Europe/Madrid`, asi que una compra del 31 de agosto a las 23:30 UTC cuenta como septiembre, que es cuando ocurrio en la tienda.

## Email Del Cliente

- Campo **opcional**. Nunca obligatorio, y la aplicacion funciona igual si el cliente no tiene email. No se pide ni se deduce automaticamente.
- Se guarda normalizado en minusculas y sin espacios. La validacion de formato es deliberadamente permisiva: rechazar la direccion real de un cliente es peor error que aceptar una rara. No se valida DNS ni MX, que es imposible en el navegador.
- Hoy **no se envia nada**. Es solo un dato de contacto para un envio manual futuro.
- No se usara para campanas, marketing, envios automaticos ni recordatorios automaticos.
- No se muestra en los listados generales, solo en la ficha y en `Ver cuenta`, donde aporta.

## Modelo Unico De Ver Cuenta

- `src/lib/account-view.ts` produce los datos de `Ver cuenta` una sola vez, y esa misma funcion alimentara el email, el PDF y el WhatsApp cuando existan. La logica de calculo no se duplica en cuatro sitios.
- Es **compartible por construccion**: no lleva identificadores tecnicos, ni la nota privada, ni el apodo, ni nada de otros clientes. Lo que no esta ahi no puede escaparse por descuido el dia que se envie fuera. Hay una prueba que serializa el modelo y falla si aparece cualquiera de esas cosas.
- La pantalla usa el modelo para todas las cifras y mantiene aparte su propia lista para poder abrir un movimiento concreto, que es lo unico que necesita identificadores.
- **No se deja ningun boton muerto.** `Enviar por email` no existe hasta que exista el backend seguro.

## Envio A Clientes (Arquitectura Futura, No Implementada)

- El envio saldra de una capa de servidor, nunca del navegador. La clave de Brevo no puede estar en el frontend.
- El destinatario se resolvera en servidor a partir del cliente y de la tienda del usuario autenticado. Nunca se aceptara un destinatario ni un contenido enviados desde el navegador: eso convertiria la aplicacion en un relay de correo abierto.
- El contenido se generara desde el modelo unico de `Ver cuenta`, que ya es compartible por construccion.
- Siempre lo disparara Marcos a mano. Ningun envio automatico.
- Se valorara registrar cuando se envio, a que email, que cliente y que usuario lo hizo. Sin convertir la aplicacion en un CRM.

## Compartir La Cuenta Del Cliente

- Marcos puede compartir con un cliente el resumen de su cuenta por **email, WhatsApp o PDF**, siempre a mano. No hay ningun envio automatico, ni recordatorios, ni campanas.
- **Un solo calculo para los cuatro canales.** El modelo canonico vive en `supabase/functions/_shared/account-summary.ts` y lo usan la pantalla, el PDF, el WhatsApp y la Edge Function del email. Ese fichero no tiene NINGUN import, precisamente para que Deno y Vite puedan cargarlo tal cual sin alias ni configuracion de build. `src/lib/aging.ts` es hoy solo un reexport suyo: el FIFO existe una vez, no dos copias que se parecen.
- El modelo es **compartible por construccion**: no lleva identificadores, ni nota privada, ni apodo, ni rutas de ficheros. Lo que no esta en el tipo no puede escaparse en un correo. Hay pruebas que serializan el modelo, el texto de WhatsApp y el binario del PDF y fallan si aparece cualquiera de esos campos.
- En la interfaz hay UNA accion, `Compartir cuenta`, que abre un menu con las tres opciones. No se llena la pantalla de tres botones grandes. Se cierra con Escape, pulsando fuera o al elegir.
- `Saldo anterior` nunca se presenta como compra, y si es el tramo mas antiguo vivo la antiguedad se dice como `al menos X días`.
- Los movimientos anulados no entran en el resumen compartible: representa la cuenta vigente.

## Envio Del Resumen Por Email

- El envio ocurre **server-side**, en la Edge Function `send-account-summary`. El navegador manda UNICAMENTE `client_id`; cualquier otro campo del cuerpo se ignora.
- El destinatario, el saldo y los movimientos los resuelve el servidor leyendo la base de datos. **Nunca se acepta como verdad nada calculado por el navegador**, ni el email ni el importe.
- La funcion usa la clave anonima con el JWT del usuario propagado, asi que todas las lecturas pasan por RLS. Un usuario de la tienda A que adivine el uuid de un cliente de la tienda B recibe cero filas. Encima hay una comprobacion explicita de `store_id`, y se responde `not_found` igual que si el cliente no existiera, para no confirmar por la puerta de atras que ese uuid existe en otra tienda. **No se usa la service role.**
- El orden de comprobaciones importa: primero se autoriza, despues se mira la configuracion. Si se mirase la configuracion antes, un intento contra un cliente ajeno respondaria `falta configuracion` en vez de `no existe`, dando una pista y ademas haciendo imposible comprobar el aislamiento mientras falte un secreto.
- Proveedor: **Brevo**, API transaccional (`POST https://api.brevo.com/v3/smtp/email`, cabecera `api-key`). Sin dependencias: `fetch` nativo con timeout. Es un flujo DISTINTO del SMTP de Supabase Auth y no debe mezclarse con el.
- Secretos server-side necesarios: `BREVO_API_KEY`, `ACCOUNT_EMAIL_FROM` y, opcional, `ACCOUNT_EMAIL_FROM_NAME`. Nunca en el frontend, ni con prefijo `VITE_`, ni en el repositorio.
- El correo es transaccional: sin marketing, sin promociones, sin tracking, sin newsletter.
- Nunca se dice `enviado` antes de que el servidor lo confirme.

## Registro De Envios Y Ritmo

- Tabla `account_summary_sends`: quien envio, a que cliente, a que direccion y cuando. **No se guarda el cuerpo del correo ni una copia de los movimientos**: eso ya esta en tickets y pagos, y duplicarlo solo multiplicaria los sitios desde los que se puede filtrar informacion de un cliente.
- Sirve ademas como limite de ritmo: la funcion no reenvia el mismo resumen al mismo cliente dentro de una ventana de 60 segundos. Reenviar mas tarde sigue siendo legitimo y no se impide.
- RLS con el mismo criterio que el resto del negocio: cada tienda ve y escribe lo suyo, y el autor debe ser el usuario autenticado. Sin politicas de update ni delete: un registro de envio no se reescribe.
- Si el registro falla despues de un envio correcto, no se convierte en un fallo de envio: el correo ya salio.

## PDF Y WhatsApp

- PDF con `jsPDF`, cargado con `import()` dinamico dentro de la funcion para que no engorde el arranque de la PWA en el movil: casi nadie descarga un PDF y no tiene sentido que todos paguen su peso al abrir la aplicacion.
- A4 vertical, con paginacion y cabecera repetida. Sin fotos de tickets, sin elementos de interfaz.
- Nombre de fichero seguro tipo `cuenta-maria-2026-08-27.pdf`: sin acentos, sin barras, sin `..`.
- En movil se ofrece `navigator.share` cuando el navegador lo soporta, con descarga normal como respaldo. Nunca se depende solo de Web Share.
- WhatsApp se abre con el texto ya preparado mediante `wa.me`; no se envia nada solo. Si el cliente tiene telefono valido se preselecciona, y si no, WhatsApp deja elegir destinatario: un telefono raro no bloquea el compartir.
- El tono es de resumen informativo, no de reclamacion. Hay una prueba que falla si aparecen `debes pagar`, `moroso`, `retraso` o `impago`.

## Registro Controlado

- El registro no es publico. La Libreta esta en fase privada para Marcos y pruebas: cualquiera que encuentre la URL no debe poder crearse una tienda. Hace falta un codigo de invitacion.
- `disable_signup` esta a false en el proyecto, o sea que Auth acepta altas de quien las pida. Por eso la puerta no puede estar en la pantalla de registro.
- **La frontera de seguridad es el trigger `handle_new_user`**, que ya creaba tienda y perfil al insertarse el usuario. Ahora ademas consume la invitacion, dentro de la MISMA transaccion que el alta de Auth. Si el codigo no vale, se lanza una excepcion y el usuario no llega a existir. Da igual que alguien llame a la API de Auth desde fuera de la aplicacion.
- En React no hay ningun codigo, ninguna lista de codigos ni ninguna comparacion de la que dependa la seguridad. La comprobacion previa (`invite_is_available`) existe solo para dar un mensaje util antes de enviar el formulario; si esa llamada falla, el alta sigue adelante y decide la base de datos.
- Modelo: tabla `store_invites` con RLS activa y **sin ninguna politica**, mas `revoke` a `public`, `anon` y `authenticated`. Nadie puede leer ni listar invitaciones; solo las funciones `security definer` las tocan. Comprobado contra el proyecto real: autenticado y anonimo reciben permiso denegado.
- Del codigo solo se guarda su SHA-256. El valor en claro existe una vez, al emitirlo. SHA-256 sin sal es correcto aqui porque el secreto son 80 bits aleatorios, no una contrasena elegida por una persona: no hay diccionario posible y permite buscar por indice unico. Un KDF lento no aportaria nada y romperia la busqueda.
- El codigo lo genera el servidor con `gen_random_bytes` (10 bytes, 20 caracteres hex). Se normaliza antes de hashear, asi que guiones, espacios y minusculas que teclee el usuario dan igual.
- Uso unico y atomico: el consumo es un `update ... where used_count < max_uses`. Dos altas simultaneas con el mismo codigo se serializan en el bloqueo de fila y la segunda ya no encuentra usos libres. Un `check (used_count <= max_uses)` es la segunda linea.
- Todas las funciones `security definer` llevan `set search_path = ''` y referencias cualificadas, para eliminar la clase entera de fallo por secuestro de search_path.
- `invite_code_hash` devuelve NULL si el codigo normalizado no mide entre 20 y 64 caracteres. Sin esa guarda, cualquier cadena de solo signos (`---`) normalizaria a vacio y compartiria un hash fijo y conocido, que se convertiria en llave maestra si alguna vez se insertara esa fila. Falla cerrado por dos vias: NULL no casa con ningun hash y choca contra el `not null`.
- `used_by` se borra en cascada a NULL. Poder borrar un usuario mal registrado es justo el caso que mas se va a necesitar, y la invitacion sigue marcada como usada por `used_count`.

### Consecuencias operativas asumidas

- **Toda alta de usuario pasa por el trigger**, tambien las hechas desde el panel de Supabase o con la API de administracion. Para dar de alta a alguien a mano hay que emitir un codigo y pasarlo en el metadata del usuario (`{"invite_code": "..."}`). Si algun dia se activa un login social, esta decision lo bloquea y habra que revisarla.
- **La invitacion se consume al crear el usuario, antes de confirmar el email.** Si alguien se registra con el email mal escrito, el codigo queda gastado y hay que reciclarlo a mano. Mover el consumo a la confirmacion abriria una ventana de cuentas sin tienda, asi que se asume.
- `max_uses` admite mas de un uso, pero `used_at` y `used_by` son singulares y se sobrescribirian. Mientras solo se emitan invitaciones de un uso, la traza es exacta.
- No hay caducidad ni funcion de revocacion: revocar es un `update` manual sobre `revoked_at`. Deuda consciente.

## Correo Saliente

- Proveedor SMTP de Auth: **Brevo**, configurado en el panel de Supabase, fuera del repositorio. El remitente por defecto de Supabase no sirve para produccion por su limite de envio.
- Validado con un alta real: el correo de confirmacion sale por Brevo y el enlace termina en `https://marcos-tienda.vercel.app` con sesion.
- **El correo de Auth y el correo a clientes son dos flujos distintos y deben seguir separados.** Auth manda confirmaciones y recuperaciones de contrasena a Marcos. El futuro resumen de cuenta va dirigido a un cliente de la tienda, con otro contenido, otra responsabilidad y otro riesgo. No se enviara desde Supabase Auth aunque el proveedor acabe siendo el mismo.
- Cuando exista el envio a clientes: el email del cliente sera opcional, el envio sera siempre manual y disparado por Marcos, y no habra recordatorios automaticos ni campanas sin una funcionalidad futura explicita y decidida aparte.
- Las plantillas de correo de Auth se editan en el panel, no por codigo. El texto en espanol vive versionado en `docs/EMAIL_TEMPLATES.md` para que pegarlo sea mecanico y quede constancia de que se envia.

## Verificacion De Email

- Comprobado contra el proyecto real, no supuesto: `mailer_autoconfirm` esta a **false**, asi que Auth exige confirmar el email antes de dar sesion.
- La pantalla de alta no finge lo contrario: si Auth no devuelve sesion, muestra `✓ Cuenta creada` y explica que se ha enviado un enlace de confirmacion. Si algun dia se activara el autoconfirm, la misma pantalla entraria directa sin tocar codigo.
- `emailRedirectTo` apunta al origen de la propia aplicacion, sin comodines.

## Ayuda

- La ayuda vive dentro de la aplicacion, no en una web aparte: es contenido estatico del propio paquete, asi que se puede leer aunque la conexion con el servidor falle, siempre que la aplicacion haya cargado. No hace ninguna peticion para mostrar texto.
- Vive en el menu de usuario, entre `Cuenta` y `Cerrar sesión`, que es el sitio que ya se habia reservado al rehacer la cabecera.
- Formato de preguntas y respuestas con bloques desplegables nativos del navegador, sin JavaScript de estado: menos que romperse.
- El lenguaje es el del mostrador, con situaciones reales. Nada de jerga tecnica; hay una prueba automatica que falla si aparece.
- Ayudas contextuales solo donde evitan una duda real: saldo anterior, foto del ticket, anulacion y cambio de contrasena. No se llenan las pantallas de iconos de interrogacion.

## Foto Del Cliente

- La foto es opcional y solo sirve para que Marcos reconozca a la persona de un vistazo. No se usa para nada mas: sin reconocimiento facial, sin clasificacion, sin biometria, sin analisis de imagen.
- Nunca bloquea el alta. El cliente se crea primero y la foto se sube despues: si Storage falla, el cliente ya existe, no se duplica, se avisa y la foto se puede reintentar desde la ficha.
- La imagen no entra en la base de datos. `clients.photo_path` guarda solo la ruta del objeto en Storage.
- Storage: se reutiliza el bucket privado `ticket-photos` con prefijo `<store_id>/client-photos/<client_id>/<uuid>.<ext>`, en vez de crear un bucket nuevo. Motivo: las politicas existentes autorizan por el primer segmento de la ruta, que es exactamente la regla que necesita un avatar. Un bucket nuevo obligaria a duplicar cuatro politicas identicas sin ganar ninguna garantia, y duplicar politicas es duplicar sitios donde equivocarse. Contrapartida asumida: el nombre del bucket ya no describe todo su contenido, y queda anotado aqui.
- No hay colision de rutas con las fotos de ticket (`<store_id>/<client_id>/<ticket_id>/...`) porque el segundo segmento de un ticket es siempre un UUID y aqui es el literal `client-photos`.
- Un `check` en `clients` obliga a que `photo_path` empiece por la tienda del propio cliente. La ruta no se autoriza por lo que mande el frontend: la tienda sale de `current_store_id()` y la RLS de Storage vuelve a comprobarla.
- Lectura siempre con signed URL temporal de una hora, renovada en cada carga del panel. Nunca hay URL publica permanente. Si una URL caduca, el avatar cae a la inicial en vez de dejar una imagen rota.
- Tamano: la imagen se reduce en el navegador antes de subirla a un maximo de 320 px de lado mayor, JPEG con calidad 0,8. Un avatar asi ocupa decenas de KB, de modo que un listado con cientos de clientes no descarga decenas de MB. Nunca se amplia una imagen ya pequena. Si el navegador no puede procesarla, se sube el original en vez de bloquear al usuario.
- Sin foto se mantiene la inicial sobre circulo de color. No se muestran huecos ni iconos vacios.

## Resumen De La Ficha

- Seccion discreta bajo las acciones. No sustituye a la deuda actual grande ni la repite.
- Definiciones exactas de cada cifra:
  - `Movimientos de deuda activos`: numero de tickets con estado activo, contando compras y saldo anterior. Deliberadamente NO se llama `tickets pendientes`: el modelo no imputa pagos a tickets concretos, asi que decir que esos tickets estan impagados seria falso.
  - `Total apuntado`: suma de los tickets activos. Incluye el saldo anterior. Excluye los anulados.
  - `Total pagado`: suma de los pagos no anulados. Un pago anulado no cuenta como pagado.
  - `Movimientos registrados`: total de tickets mas pagos, incluidos los anulados. Es el historico registrado, no el economico.
  - `Ultima compra`: fecha del ticket activo mas reciente con origen `purchase`. Un saldo anterior nunca cuenta como compra. Si no hay ninguna, se muestra `—`.
  - `Ultimo pago`: fecha del pago no anulado mas reciente. Si no hay, `Todavía no hay pagos`.
- La ficha lo dice en texto bajo las cifras para que no haya ambiguedad: los totales no cuentan anulados, el saldo anterior cuenta como apuntado y la ultima compra no lo incluye.
- Metrica descartada a proposito: `Antiguedad de la deuda`. Calcularla con `created_at` seria mentir en cuanto hay pagos parciales o un saldo anterior, cuya fecha de registro no es la fecha en que nacio la deuda. Queda como P1 aparte con su imputacion FIFO documentada.
- Sin graficas: para esta tienda una cifra clara vale mas que un panel.

## Fotos

- La foto del ticket es opcional.
- En movil se usa `accept="image/*"` y `capture="environment"` para abrir camara trasera cuando el navegador lo soporte.
- En escritorio se mantiene selector de archivo.
- Si falla la subida de foto, el ticket no se duplica; se permite reintentar la foto.

## Auth Y Cuenta

- Login, sesion y recuperacion de contrasena se hacen con Supabase Auth.
- La vista `Cuenta` muestra email, permite cambiar contrasena y cerrar sesion.
- Las redirect URLs de Supabase deben permitir `https://marcos-tienda.vercel.app`.
- Las operaciones sensibles de cuenta requieren reautenticacion. Cambiar la contrasena exige volver a introducir la contrasena actual y validarla contra Supabase antes de mostrar siquiera los campos de contrasena nueva. Motivo: reducir el riesgo de apropiacion de cuenta desde un dispositivo con la sesion ya abierta, que es el escenario realista en un movil de mostrador.
- El formulario de contrasena nueva no se muestra al entrar en `Cuenta`; aparece solo despues de una reautenticacion correcta.
- La contrasena nueva se pide dos veces y debe cumplir un minimo razonable: al menos 8 caracteres, con letras y numeros.
- Si el usuario no recuerda su contrasena actual, `Cuenta` ofrece salida al flujo de recuperacion de Supabase ya existente en lugar de relajar la reautenticacion.
- El exito solo se anuncia tras confirmacion real de Supabase; un error de Supabase nunca se presenta como cambio realizado.
- Ni la contrasena actual ni la nueva se guardan en estado persistente, logs, localStorage ni base de datos: viven solo en el estado del formulario y se limpian al cambiar de paso.

## Funciones Aplazadas

- PIN local: aplazado. Debe ser solo desbloqueo rapido sobre una sesion Supabase valida, sin guardar PIN en texto plano.
- Migracion inicial de saldos desde papel: P1 alta antes de implantacion real.
- WhatsApp, PDF, OCR, catalogo, inventario, TPV, pedidos desde casa y escritura economica offline quedan fuera de esta fase.
