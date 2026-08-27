# Seguridad

Todas las tablas de negocio tienen RLS habilitado. La función `public.current_store_id()` es `SECURITY DEFINER`, tiene `search_path` fijado y solo puede ejecutarse por usuarios autenticados. Las políticas comparan el `store_id` de cada fila con el perfil asociado a `auth.uid()`; no confían en React.

Las operaciones permitidas son lectura, alta y modificación dentro de la tienda propia. No hay políticas `DELETE` para tickets o pagos. Los triggers impiden cambiar después la tienda o el usuario creador. Las FKs compuestas impiden referencias de clientes entre tiendas.

El bucket `ticket-photos` es privado. Las rutas esperadas son `store_id/client_id/ticket_id/archivo`; Storage comprueba el primer segmento contra la tienda autenticada. La ruta por sí sola no sustituye a RLS. El cliente debe usar `download()` o signed URLs temporales, nunca URLs públicas permanentes.

## Auth

El login y la recuperacion de contrasena se delegan en Supabase Auth. El frontend no implementa recuperacion casera ni modifica email/Auth directamente. El cambio de contrasena dentro de `Cuenta` usa la sesion Supabase valida.

Las redirect URLs de Supabase deben incluir `https://marcos-tienda.vercel.app` para que el enlace de recuperacion vuelva a la PWA desplegada.

## Secretos Y Cliente

El frontend solo debe recibir URL de Supabase y anon key mediante variables `VITE_`. La service role key se reserva para operaciones administrativas puntuales fuera del cliente y no se versiona.

No hay escrituras economicas offline. Si falla la conexion o el guardado, la interfaz muestra error y no declara exito. Las acciones economicas mantienen proteccion frente a doble submit con estado `busy`.

## Pruebas

`supabase/tests/security.sql` usa pgTAP para comprobar los ocho escenarios mínimos de aislamiento e integridad. Se ejecuta con `npm run test:security` después de `supabase start`.
