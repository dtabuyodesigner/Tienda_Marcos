# Pendientes

Inventario vivo del proyecto. No implica implementacion automatica: cada punto debe revisarse antes de entrar en una fase de trabajo.

## P0 - Antes de entregar a Marcos

Sin bloqueos documentados ahora mismo.

## Resuelto en Fase 3B Subtrabajo 2

### Mejoras UX detectadas en prueba real

- Estado: resuelto y validado sobre `ab12c75b29c8213f009fb1ea3de5f180df035a91`.
- Incluye: clientes recientes al apuntar compra, orden inteligente de clientes, fila completa pulsable, confirmaciones con saldo actualizado, boton secundario `Ver historial`, alta de cliente desde ficha con vuelta correcta al cancelar, ocultar `Cobrar` cuando el saldo es cero, vista `Ver cuenta`, estados vacios claros y mejor presentacion de `Foto del ticket`.
- Motivo: reducir pasos reales de mostrador sin ampliar el producto hacia TPV, catalogo, OCR, WhatsApp o PDF.

### Endurecimiento de la pantalla Cuenta

- Estado: resuelto.
- Incluye: email de acceso legible en su propia linea, cambio de contrasena oculto tras una accion secundaria, reautenticacion obligatoria con la contrasena actual, doble campo de contrasena nueva, salida al flujo de recuperacion de Supabase y confirmacion solo tras respuesta real de Supabase.
- Motivo: una sesion abierta olvidada en el movil no debe bastar para apropiarse de la cuenta.

### Identificacion de la tienda en cabecera

- Estado: resuelto.
- Incluye: `Covirán · San Miguel de las Dueñas · El Bierzo · León` como subtitulo de la cabecera y alineacion coherente de las acciones de Inicio.
- Motivo: la aplicacion debe identificar la tienda concreta, no solo el producto.

## P1 - Proxima iteracion

### Migracion inicial de saldos desde papel

- Descripcion: crear un flujo especifico para trasladar a La Libreta de Marcos las deudas que ya existan antes de empezar a usar la aplicacion. Ejemplo: Pedrito ya debe 86,40 EUR en tickets de papel anteriores y debe registrarse como saldo inicial sin inventar compras nuevas.
- Utilidad: evita mantener durante semanas dos sistemas paralelos, papel y app, y facilita la implantacion real.
- Prioridad: P1 alta antes de implantacion definitiva con Marcos.
- Estado: pendiente.
- Dependencias: probar primero el MVP actual y conocer aproximadamente cuantos clientes/deudas pendientes tiene Marcos cuando vaya a empezar a utilizar la aplicacion.
- Requisitos futuros: el movimiento debe quedar identificado como `Saldo inicial / deuda anterior a La Libreta`, registrar cliente, importe, fecha de migracion, usuario, nota opcional y origen `saldo inicial`. No se inventan tickets individuales por cada compra antigua de papel: se registra un unico movimiento de saldo inicial por cliente.
- Integridad: importe en centimos enteros, `amount > 0`, RLS por tienda, sin borrado fisico normal y anulacion con trazabilidad.
- Alcance tecnico: debe formar parte del calculo de saldo y del historial del cliente. Si requiere cambios de esquema, hacer migracion SQL versionada, aplicarla a `Marcos_Tienda` y verificar RLS/integridad.

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
