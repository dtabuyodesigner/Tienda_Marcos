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

### Identificacion de la tienda en cabecera (Fase 3B Subtrabajo 2)

- Estado: resuelto.
- Incluye: `Covirán · San Miguel de las Dueñas · El Bierzo · León` como subtitulo de la cabecera y alineacion coherente de las acciones de Inicio.
- Motivo: la aplicacion debe identificar la tienda concreta, no solo el producto.

## P1 - Proxima iteracion

### Identidad visual / logo de la tienda

- Descripcion: cuando Marcos facilite una o varias fotografias o referencias visuales reales de la tienda, crear una identidad grafica sencilla para `La Libreta de Marcos`.
- Utilidad: dar a la aplicacion una imagen reconocible y propia de la tienda en el movil.
- Debe servir como: icono PWA 192x192, icono PWA 512x512, favicon, apple-touch-icon y posible marca pequena en la cabecera.
- Prioridad: P1.
- Estado: pendiente.
- Restriccion: no utilizar imagenes inventadas ni asumir que se puede usar el logotipo oficial de Coviran sin revisar primero que material aporta Marcos y con que permisos.
- Dependencias: material grafico real de la tienda.

### PIN local de acceso rapido

- Descripcion: desbloqueo local con PIN de 4 a 6 cifras solo cuando ya exista una sesion Supabase valida.
- Utilidad: acelerar el uso diario en movil.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: prueba real en movil y diseno de almacenamiento seguro.

### Bloqueo automatico por inactividad

- Descripcion: bloquear la aplicacion tras un periodo configurable de inactividad, desbloqueable mediante PIN mientras la sesion Supabase siga siendo valida.
- Utilidad: reduce el riesgo de que un movil desatendido en el mostrador quede abierto sobre datos economicos de clientes.
- Prioridad: P1.
- Estado: pendiente, no implementado.
- Dependencias: implementar antes el PIN local; el bloqueo no sustituye a Supabase Auth ni relaja RLS.

### Revisar comportamiento con cientos de clientes

- Descripcion: validar orden, busqueda y posible agrupacion cuando la libreta tenga muchos clientes.
- Utilidad: mantener rapidez detras del mostrador.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: datos reales o simulacion suficiente de volumen.

### Filtro Con deuda / Todos

- Descripcion: posible control para separar clientes con deuda de clientes a cero.
- Utilidad: reducir ruido sin ocultar clientes que pueden volver a fiar.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: observar si el listado real crece lo suficiente.

### Avisos de cuentas pendientes por antiguedad

- Descripcion: avisar a Marcos dentro de la aplicacion cuando una cuenta lleve pendiente mas de un numero determinado de dias. Umbral inicial propuesto: 7 dias, disenado desde el principio para ser configurable despues (7/15/30 o valor personalizado).
- Utilidad: en una tienda pequena, saber que tres cuentas llevan mas de una semana sin moverse vale mas que cualquier grafica. Es el aviso que convierte la libreta en algo que trabaja para Marcos en vez de limitarse a registrar.
- Prioridad: P1.
- Estado: pendiente, no implementado.
- Dependencias: diseno del calculo de antiguedad y prueba real con Marcos.

#### Presentacion objetivo

- Primera version: aviso dentro de la aplicacion, en Inicio y en la ficha del cliente. Nada de contacto automatico.
- En Inicio, resumen de una linea sobre el total pendiente que ya se muestra. Forma buscada:
  - `Pendiente total: 483,20 € · 7 clientes`
  - `⚠ 3 cuentas llevan más de 7 días pendientes`
- Al abrir el aviso, listar cliente, importe pendiente y antiguedad.
- En la ficha del cliente, marca discreta de antiguedad junto al saldo. Jerarquia secundaria: no debe competir con `+ Nueva compra` ni `Cobrar`.
- Enlaza con `Resumen/PDF de cuenta`: el mismo calculo de antiguedad deberia alimentar ambos.

#### Calculo de antiguedad

Es la parte delicada del pendiente y hay que resolverla antes de escribir interfaz.

- La antiguedad es la de la deuda que sigue viva, no la del ultimo movimiento. Una compra nueva no debe rejuvenecer una deuda anterior que sigue sin pagarse.
- Metodo propuesto: imputar los pagos a la deuda mas antigua primero (FIFO). La antiguedad de la cuenta es la del movimiento de deuda mas antiguo que aun no ha quedado cubierto por pagos.
  - Ejemplo: compra del 27/07 de 20,00 EUR, compra del 25/08 de 10,00 EUR y un pago de 15,00 EUR. El pago cubre 15,00 de la compra del 27/07, que sigue viva con 5,00 EUR. La cuenta tiene la antiguedad del 27/07, no la del 25/08.
- Solo entran movimientos activos: tickets anulados y pagos anulados quedan fuera del calculo. Anular un pago debe recalcular la imputacion desde cero, no parchear el resultado anterior.
- Si el saldo del cliente es cero, no hay antiguedad que mostrar.
- Definir "dia" con cuidado: dias naturales completos en la zona horaria de la tienda (`Europe/Madrid`), para que `7 dias` signifique lo mismo a las 9:00 que a las 23:00.
- El calculo debe vivir en una funcion pura y con tests, al estilo de `calculateActiveBalance`. `loadDashboard` ya trae tickets activos y pagos no anulados de la tienda, asi que la primera version no deberia necesitar consultas nuevas.

#### Tratamiento de `opening_balance`

- Problema: la fecha de registro de un saldo anterior es el dia en que Marcos lo apunto, no el dia en que nacio la deuda. Tratarlo por `created_at` haria que una deuda de meses apareciese como recien nacida, que es justo el error que este aviso debe evitar.
- Regla minima innegociable: un saldo anterior nunca puede considerarse mas nuevo que su fecha de registro. Por definicion la deuda ya existia antes.
- Opciones a valorar:
  1. Anadir un campo opcional de fecha de origen al registrar el saldo anterior (`deuda desde`), con migracion versionada. Es la solucion correcta: Marcos suele saber aproximadamente desde cuando arrastra la deuda.
  2. Sin ese dato, usar la fecha de registro como cota inferior y presentarlo como `pendiente desde al menos X dias`, sin afirmar una antiguedad exacta que no conocemos.
  3. Descartada: excluir los saldos anteriores del aviso. Son precisamente las deudas mas viejas y dejarlas fuera vaciaria de sentido la funcionalidad.
- Recomendacion: implementar la opcion 2 primero, porque no necesita cambios de esquema, y evaluar la opcion 1 con Marcos cuando se vea si recuerda las fechas reales.

#### Limites explicitos

- No contactar automaticamente al cliente en ninguna forma.
- No enviar WhatsApp, SMS ni email sin una funcionalidad futura explicita, disenada aparte y siempre disparada por Marcos, nunca automatica.
- Notificacion push o resumen diario al movil de Marcos: solo a estudiar despues de que el aviso dentro de la aplicacion se haya probado en uso real.

### Compartir cuenta por WhatsApp

- Descripcion: permitir compartir un resumen legible de la cuenta del cliente.
- Utilidad: resolver consultas sin ensenar siempre el movil fisicamente.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: definir formato y privacidad.

### Resumen/PDF de cuenta

- Descripcion: generar un resumen exportable de movimientos y saldo.
- Utilidad: soporte para explicaciones y conciliacion.
- Prioridad: P1.
- Estado: pendiente.
- Dependencias: estabilizar primero la vista de cuenta.
- Relacion: comparte calculo con `Avisos de cuentas pendientes por antiguedad`. La antiguedad de la deuda deberia resolverse una sola vez y alimentar el aviso de Inicio y el resumen.

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
