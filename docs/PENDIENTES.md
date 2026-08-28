# Pendientes

Inventario vivo del proyecto. No implica implementacion automatica: cada punto debe revisarse antes de entrar en una fase de trabajo.

## P0 - Antes de entregar a Marcos

Sin bloqueos documentados ahora mismo.

## Resuelto

### Mejoras UX detectadas en prueba real (Fase 3B Subtrabajo 2)

- Estado: resuelto y validado sobre `ab12c75b29c8213f009fb1ea3de5f180df035a91`.
- Incluye: clientes recientes al apuntar compra, orden inteligente de clientes, fila completa pulsable, confirmaciones con saldo actualizado, boton secundario `Ver historial`, alta de cliente desde ficha con vuelta correcta al cancelar, ocultar `Cobrar` cuando el saldo es cero, vista `Ver cuenta`, estados vacios claros y mejor presentacion de `Foto del ticket`.
- Motivo: reducir pasos reales de mostrador sin ampliar el producto hacia TPV, catalogo, OCR, WhatsApp o PDF.

### Endurecimiento de la pantalla Cuenta (Fase 3B Subtrabajo 2)

- Estado: resuelto.
- Incluye: email de acceso legible en su propia linea, cambio de contrasena oculto tras una accion secundaria, reautenticacion obligatoria con la contrasena actual, doble campo de contrasena nueva, salida al flujo de recuperacion de Supabase y confirmacion solo tras respuesta real de Supabase.
- Motivo: una sesion abierta olvidada en el movil no debe bastar para apropiarse de la cuenta.

### Migracion inicial de saldos desde papel

- Estado: **RESUELTO / VALIDADO** el 27 de agosto de 2026 contra el proyecto real `Marcos_Tienda`.
- Descripcion: trasladar a La Libreta la deuda que cada cliente ya tenia en tickets de papel, sin inventar compras individuales. Ejemplo: Pedrito ya debia 86,40 EUR y se registra como un unico movimiento `Saldo anterior`.
- Modelo: `tickets.origin` (`purchase` | `opening_balance`), migracion versionada `202608270003_add_movement_origin.sql`. El detalle y el motivo estan en `docs/DECISIONES.md`.
- Migraciones aplicadas en `Marcos_Tienda`: `202608270002_add_client_reference_fields.sql` y `202608270003_add_movement_origin.sql`. `supabase migration list --linked` confirma 0001, 0002 y 0003 en local y en remoto, y `db push --dry-run` responde `Remote database is up to date`.
- Validacion remota: 18 comprobaciones en verde sobre datos ficticios, ejecutadas dentro de una transaccion revertida para no dejar residuo. Cubren alta, importe exacto, origen explicito, rechazo de foto, rechazo de segundo saldo anterior vivo, rechazo de importe cero y negativo, integridad cross-store, inmutabilidad del origen, anulacion con trazabilidad, saldo tras anular, re-registro corregido y aislamiento RLS por tienda.
- Datos previos intactos: 9 tiendas, 13 clientes, 4 tickets y 1 pago antes y despues; los 4 tickets existentes quedaron con `origin = 'purchase'`; deuda total sin cambios en 9.700 centimos; `max(updated_at)` de tickets sin moverse.
- Pendiente asociado: `npm run test:security` (pgTAP) no se ha podido ejecutar por falta de Docker en la maquina de trabajo. Las pruebas estan escritas y ampliadas a 13 asserts, pero no se dan por pasadas.

### Onboarding / registro controlado

- Estado: **RESUELTO / VALIDADO** el 27 de agosto de 2026 contra `Marcos_Tienda`, con una salvedad de entrega anotada abajo.
- Incluye: `Crear mi cuenta` en la pantalla de acceso, alta con nombre, email, contrasena repetida, nombre de tienda y codigo de invitacion; creacion automatica de tienda y perfil con rol `owner`; y aislamiento entre tiendas intacto.
- Registro no publico: hace falta invitacion de un solo uso, validada y consumida en base de datos. Migracion `202608270005_add_store_invites.sql` aplicada.
- Validacion remota: 14 comprobaciones en verde y prueba por la API real de Auth, que rechaza el alta sin codigo y con codigo inventado.
- **SMTP propio (Brevo): RESUELTO.** Configurado fuera del repositorio y validado con un alta real de extremo a extremo: el correo de confirmacion sale por Brevo y llega a la bandeja.
- **Site URL y Redirect URL: RESUELTO.** El enlace del correo pasa por Supabase y termina en `https://marcos-tienda.vercel.app` con sesion, comprobado siguiendo la cadena de redirecciones real.
- **Validacion de extremo a extremo (27 de agosto de 2026)**: alta con invitacion valida, correo entregado por Brevo, enlace confirmado, login posterior con sesion, usuario confirmado, una sola tienda y un solo perfil con rol `owner`, tienda vacia y sin ver datos de otras tiendas. Reutilizar la invitacion, registrarse sin codigo y con codigo inventado fallan los tres. Datos de prueba eliminados despues, sin residuos.

### Plantillas de correo de Auth en espanol

- Estado: **PENDIENTE DE PANEL**. El contenido esta escrito y listo en `docs/EMAIL_TEMPLATES.md`, pero aplicarlo requiere pegarlo en el Dashboard de Supabase y desde aqui no hay acceso de gestion.
- Comprobado en la prueba real: hoy el correo de confirmacion llega en ingles (`Confirm your email address`).
- Que hay que hacer: Authentication -> Emails -> Templates, pegar asunto y cuerpo de `Confirm signup` y `Reset password`. Las demas plantillas no se usan en este proyecto y se explica en el documento por que no hace falta tocarlas.
- No pasa a resuelto hasta que Dani confirme que las ha pegado.

### Ayuda integrada

- Estado: **RESUELTO / VALIDADO**.
- Incluye: pantalla `Ayuda` en el menu de usuario entre `Cuenta` y `Cerrar sesión`, con 14 preguntas reales de mostrador en bloques desplegables, y ayudas contextuales en saldo anterior, foto del ticket, anulacion y cambio de contrasena.
- Es contenido estatico de la aplicacion: se lee sin pedir nada al servidor.

### Filtro Con deuda / Todos

- Estado: **RESUELTO**.
- Inicio lleva dos botones con contador: `Todos (48)` y `Con deuda (7)`. Por defecto **Todos**, que es lo que Marcos ya conocia: esconderle clientes sin avisar habria sido la sorpresa cara.
- La busqueda funciona dentro del filtro activo. Si busca a alguien que existe pero esta filtrado, se le dice `No aparece porque no tiene deuda` con un `Ver todos` al lado, en vez de dejarle pensando que ha desaparecido.
- La preferencia no se guarda: vuelve a `Todos` en cada sesion. Un filtro pegajoso que oculta clientes es peor que volver a pulsarlo.

### Comportamiento con cientos de clientes

- Estado: **RESUELTO / MEDIDO**.
- Probado con 100, 300 y 500 clientes y hasta ~5.500 movimientos, con datos sinteticos deterministas.
- Se encontro y se arreglo un problema real: abrir Inicio con 500 clientes costaba entre 1,5 y 5,7 segundos. El 93% del tiempo se iba en construir un `Intl.DateTimeFormat` nuevo por cada movimiento. Cacheando el formateador y agrupando los movimientos por cliente una sola vez, la bateria completa paso de **30,6 s a ~1,0 s**.
- Verificado ademas que el total pendiente agregado coincide exactamente con la suma cliente a cliente. Un descuadre a 500 clientes seria mas grave que un milisegundo.
- No se ha metido virtualizacion ni paginacion: a 500 clientes la lista va bien y no hacia falta.

### PIN local y bloqueo por inactividad

- Estado: **RESUELTO**.
- PIN de 4 a 6 cifras, opcional, en `Cuenta -> Bloqueo con PIN`. Activar, cambiar, quitar y bloquear ahora.
- Bloqueo automatico configurable: Nunca, 1, 5, 15 o 30 minutos.
- Alcance documentado en `docs/DECISIONES.md`: el PIN tapa la interfaz de ESE movil. No cierra la sesion de Supabase ni sustituye a la contrasena.

### Envio del resumen de cuenta por email

- Estado: **RESUELTO / VALIDADO** de extremo a extremo el 28 de agosto de 2026 contra produccion.
- Recorrido comprobado: sesion autenticada, cliente de la propia tienda, Edge Function `ok: true`, Brevo acepta, y el correo llega de verdad a la bandeja con asunto `Tu cuenta — La Libreta de Marcos`, la compra de 30,00 EUR, el pago de -10,00 EUR, `Pendiente actual: 20,00 €` y `Pendiente desde hoy`.
- Privacidad verificada sobre el mensaje entregado: no aparecen la nota privada, el apodo, el telefono, ningun identificador ni ninguna ruta de fichero. Solo lo que lleva el modelo compartible.
- `account_summary_sends` registro exactamente un envio, con tienda, cliente, autor, canal, destinatario y fecha. Sin cuerpo del correo.
- Datos de prueba eliminados sin residuos.
- Nota sobre el remitente: `ACCOUNT_EMAIL_FROM` es `dtabuyodesigner@gmail.com`, verificado en Brevo. Como `gmail.com` no se puede firmar con DKIM desde Brevo y su DMARC es `p=REJECT`, Brevo reescribe el `From` visible a su subdominio `@11432328.brevosend.com` y deja la direccion configurada en `Reply-To`. Es el comportamiento correcto del proveedor y por eso el correo pasa SPF, DKIM y DMARC. Si algun dia se quiere que el `From` muestre un dominio propio, hay que verificar ese dominio en Brevo.

### Compartir la cuenta del cliente: PDF y WhatsApp

- Estado: **RESUELTO / VALIDADO**.
- Incluye: accion `Compartir cuenta` en `Ver cuenta`, PDF A4 descargable y texto de WhatsApp preparado, los dos derivados del modelo canonico compartible.
- PDF inspeccionado de verdad con `pdfinfo`/`pdftotext`: A4, acentos correctos, `Saldo anterior` bien etiquetado, importes y antiguedad correctos, cero datos privados.

### Antiguedad de deuda (FIFO)

- Estado: **RESUELTO / VALIDADO**.
- Incluye: imputacion FIFO de pagos sobre la deuda mas antigua, calculo derivado sin estado nuevo, dias naturales en `Europe/Madrid`, y tratamiento honesto del saldo anterior como cota inferior (`al menos X días`).
- Definiciones y motivos en `docs/DECISIONES.md`.

### Avisos de cuentas pendientes por antiguedad

- Estado: **RESUELTO / VALIDADO**.
- Incluye: aviso en Inicio con nombre, saldo y antiguedad de hasta tres cuentas, `Ver todas` hacia el Resumen, y marca discreta en la ficha del cliente. Sin etiquetas de moroso ni scoring.
- Umbral en la constante `OVERDUE_THRESHOLD_DAYS` de `src/lib/aging.ts`. Regla: estrictamente mas de 7 dias.

### Resumen global de la tienda

- Estado: **RESUELTO / VALIDADO**.
- Incluye: pantalla `Resumen` en el menu de usuario con pendiente total, clientes con deuda, cuentas y deuda de mas de 7 dias, compras y cobros del mes, y lista de las cinco cuentas mas antiguas.

### Email opcional del cliente (campo)

- Estado: **RESUELTO / VALIDADO** como campo y modelo. El envio NO esta hecho y sigue como pendiente aparte.
- Incluye: `clients.email` opcional mediante la migracion `202608270006_add_client_email.sql`, alta y edicion desde la ficha, normalizacion y validacion de formato, y modelo unico de `Ver cuenta` compartible por construccion.

### Foto opcional del cliente

- Estado: **RESUELTO / VALIDADO** el 27 de agosto de 2026 contra `Marcos_Tienda`.
- Incluye: foto opcional en el alta, anadir/cambiar/quitar desde la ficha, avatar en Inicio, en seleccion de cliente, en compra, en saldo anterior, en la ficha, en Historial y en Ver cuenta, y fallback a la inicial cuando no hay foto o la imagen no carga.
- Storage: bucket privado existente con prefijo `<store_id>/client-photos/<client_id>/`, signed URLs de una hora, sin URL publica permanente. Migracion `202608270004_add_client_photo.sql` aplicada.
- Validacion remota: 8 comprobaciones de Storage en verde (la tienda sube y ve su foto, otra tienda no la ve, anonimo no la ve, no puede escribir bajo otra tienda, rutas de otra tienda y rutas relativas rechazadas por constraint).
- Tamano: 320 px de lado mayor, JPEG calidad 0,8.

### Resumen de la ficha de cliente

- Estado: **RESUELTO / VALIDADO**.
- Incluye: movimientos de deuda activos, ultima compra, ultimo pago, total apuntado, total pagado y movimientos registrados, con las definiciones exactas en `docs/DECISIONES.md`.
- Deliberadamente fuera: antiguedad de la deuda, que sigue como P1 aparte porque necesita imputacion FIFO y tratamiento del saldo anterior.

### Identificacion de la tienda en cabecera (Fase 3B Subtrabajo 2)

- Estado: resuelto.
- Incluye: `Covirán · San Miguel de las Dueñas · El Bierzo · León` como subtitulo de la cabecera y alineacion coherente de las acciones de Inicio.
- Motivo: la aplicacion debe identificar la tienda concreta, no solo el producto.

## P0 - BLOQUEANTE antes de entregar a Marcos

### El correo de confirmacion de Auth no se entrega

- Estado: **BLOQUEANTE**. Sin esto Marcos no puede crear su cuenta.
- Sintoma: el alta funciona y Auth marca `confirmation_sent_at`, pero el correo no llega nunca y `email_confirmed_at` se queda vacio.
- Evidencia: el ultimo correo de confirmacion entregado fue el 28 de agosto a las 07:24 UTC. Los intentos de las 07:41 y las 11:04 no llegaron: buscados por destinatario, asunto, remitente y sin filtros, en bandeja, spam y papelera.
- Lo que NO es: no es la cuenta de Brevo ni la clave. El resumen de cuenta, que sale por la **API v3** de Brevo, se entrego correctamente a las 10:32 del mismo dia.
- Hipotesis principal: el remitente del **SMTP de Auth** en Supabase se cambio a `dtabuyodesigner@gmail.com`. Por SMTP, Brevo relaya el `From` tal cual, y `gmail.com` publica DMARC `p=REJECT`, asi que Gmail rechaza el mensaje en la propia entrega. Por API v3 no pasa porque ahi Brevo **reescribe** el `From` a su subdominio, cosa que se comprobo en las cabeceras del resumen entregado.
- Comprobacion: Supabase -> Authentication -> SMTP Settings -> `Sender email`. Si pone `dtabuyodesigner@gmail.com`, devolverlo a `dtabuyodesigner@11432328.brevosend.com`, que es el remitente con el que los correos SI llegaban. Confirmar despues en Brevo -> Transactional -> Logs el estado de los intentos de las 07:41 y 11:04.
- No se ha tocado la configuracion de Auth: se diagnostica, no se cambia a ciegas.

## P1 - Proxima iteracion

### Identidad visual / logo de la tienda

- Descripcion: cuando Marcos facilite una o varias fotografias o referencias visuales reales de la tienda, crear una identidad grafica sencilla para `La Libreta de Marcos`.
- Utilidad: dar a la aplicacion una imagen reconocible y propia de la tienda en el movil.
- Debe servir como: icono PWA 192x192, icono PWA 512x512, favicon, apple-touch-icon y posible marca pequena en la cabecera.
- Prioridad: P1.
- Estado: pendiente.
- Restriccion: no utilizar imagenes inventadas ni asumir que se puede usar el logotipo oficial de Coviran sin revisar primero que material aporta Marcos y con que permisos.
- Dependencias: material grafico real de la tienda.

### Mejoras que salgan de la prueba real de Marcos

- Descripcion: registrar ajustes observados durante uso real.
- Utilidad: priorizar friccion demostrada frente a ideas teoricas.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: sesiones de prueba con Marcos.

## P2 - Futuro

### Pedidos desde casa

- Descripcion: canal para que clientes pidan antes de pasar por tienda.
- Utilidad: posible extension comercial.
- Prioridad: P2.
- Estado: pendiente.
- Dependencias: validar primero el MVP de fiados.

### Catalogo, codigos de barras y OCR

- Descripcion: productos, escaneo y lectura automatica de tickets.
- Utilidad: reducir entrada manual en fases futuras.
- Prioridad: P2.
- Estado: pendiente.
- Dependencias: no sustituir el TPV sin analisis especifico.

### Estadisticas, recordatorios y notificaciones

- Descripcion: informes de deuda, avisos y seguimiento.
- Utilidad: control operativo futuro.
- Prioridad: P2.
- Estado: pendiente.
- Dependencias: definir reglas de comunicacion y privacidad.

### Exportacion/backup amigable

- Descripcion: descarga o copia comprensible de datos de la libreta.
- Utilidad: confianza operativa y continuidad.
- Prioridad: P2.
- Estado: pendiente.
- Dependencias: diseno de permisos y formato.

### Varios empleados y modo tablet

- Descripcion: soporte para mas usuarios y optimizacion de pantallas grandes.
- Utilidad: si la tienda lo necesita.
- Prioridad: P2.
- Estado: pendiente.
- Dependencias: uso real con mas de una persona.

## Fuera de alcance

### Sustituir TPV, facturacion, contabilidad fiscal e inventario completo

- Descripcion: funciones propias de sistemas de gestion comercial o fiscal.
- Utilidad: no forman parte del objetivo actual.
- Prioridad: fuera de alcance.
- Estado: descartado para el MVP.
- Dependencias: requeririan una fase y analisis independientes.

### Escrituras economicas offline sin diseno especifico

- Descripcion: permitir guardar movimientos sin conexion y sincronizar despues.
- Utilidad: podria ayudar en cortes de conexion.
- Prioridad: fuera de alcance actual.
- Estado: aplazado.
- Dependencias: resolver conflictos, duplicados y trazabilidad antes de implementarlo.
