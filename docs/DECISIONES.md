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
