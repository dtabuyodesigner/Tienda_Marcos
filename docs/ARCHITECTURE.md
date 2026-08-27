# Arquitectura

React + Vite + TypeScript se sirve como PWA y usa únicamente la clave anon del proyecto Supabase. Supabase Auth mantiene la sesión; el frontend no contiene secretos ni service role key.

El objetivo del MVP es sustituir la libreta de fiados, no el TPV ni el inventario. La primera pantalla operativa es la libreta: total pendiente, clientes, busqueda y acceso rapido a apuntar compra.

## Modelo

`stores` es la raiz multi-tienda. `profiles` vincula cada usuario Auth a una tienda y limita los roles iniciales a `owner` y `staff`. `clients`, `tickets` y `payments` llevan `store_id` explicito. El saldo se calcula como tickets activos menos pagos no anulados; no se duplica en `clients`.

Tickets y pagos usan `BIGINT amount_cents`, nunca float. Sus operaciones económicas no se borran: se anulan conservando autor, fecha y motivo.

`tickets.origin` distingue el tipo de movimiento de deuda: `purchase` es una compra real de mostrador y `opening_balance` es la deuda que el cliente ya tenia antes de usar La Libreta. Ambos suman igual al saldo, pero nunca se confunden: el origen es inmutable por trigger, un saldo anterior no admite foto de ticket y un indice unico parcial impide que un cliente tenga dos saldos anteriores vivos a la vez.

`clients` admite `nickname` y `note` como campos opcionales de ayuda operativa. El apodo participa en busqueda; la nota se muestra en la ficha sin intervenir en calculos economicos.

## UX Y Orden

La lista principal ordena clientes con deuda primero. Como criterio secundario usa la fecha de actividad economica mas reciente y, si empata, el nombre en orden alfabetico. En la seleccion de compra se muestran clientes recientes antes del listado completo para reducir pasos en mostrador.

La fila completa del cliente es pulsable. La ficha concentra acciones principales (`+ Nueva compra`, `Cobrar` si hay deuda) y acciones secundarias (`Ver historial`, `Ver cuenta`, `+ Nuevo cliente`). El alta abierta desde una ficha vuelve a esa ficha si se cancela y abre la ficha del cliente creado al guardar.

## Integridad

Las claves únicas `(store_id, id)` permiten FKs compuestas `(store_id, client_id)`. Así, un ticket con la tienda A y un cliente de B es rechazado por PostgreSQL aunque se envíe manualmente desde otro cliente. Triggers reutilizables actualizan `updated_at` y protegen campos de pertenencia/autoria.

El trigger de alta de Auth crea una tienda nueva para cada usuario nuevo. La asignación de personal a una tienda existente se hará posteriormente mediante un flujo administrativo servidor-side; nunca se acepta `store_id` arbitrario desde metadata de registro.

## Fotos

La foto de ticket es opcional. En movil se usa `accept="image/*"` y `capture="environment"` para permitir camara trasera cuando el navegador lo soporte; en escritorio conserva selector de archivo.

La compra se crea antes de adjuntar la foto. Si falla Storage, se mantiene el ticket economico y se permite reintentar la foto sin duplicar compra.
