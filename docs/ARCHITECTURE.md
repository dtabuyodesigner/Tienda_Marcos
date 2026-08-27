# Arquitectura

React + Vite + TypeScript se sirve como PWA y usa únicamente la clave anon del proyecto Supabase. Supabase Auth mantiene la sesión; el frontend no contiene secretos ni service role key.

## Modelo

`stores` es la raíz multi-tienda. `profiles` vincula cada usuario Auth a una tienda y limita los roles iniciales a `owner` y `staff`. `clients`, `tickets` y `payments` llevan `store_id` explícito. El saldo se calculará en una fase posterior como tickets activos menos pagos activos; no se duplica en `clients`.

Tickets y pagos usan `BIGINT amount_cents`, nunca float. Sus operaciones económicas no se borran: se anulan conservando autor, fecha y motivo.

## Integridad

Las claves únicas `(store_id, id)` permiten FKs compuestas `(store_id, client_id)`. Así, un ticket con la tienda A y un cliente de B es rechazado por PostgreSQL aunque se envíe manualmente desde otro cliente. Triggers reutilizables actualizan `updated_at` y protegen campos de pertenencia/autoria.

El trigger de alta de Auth crea una tienda nueva para cada usuario nuevo. La asignación de personal a una tienda existente se hará posteriormente mediante un flujo administrativo servidor-side; nunca se acepta `store_id` arbitrario desde metadata de registro.
