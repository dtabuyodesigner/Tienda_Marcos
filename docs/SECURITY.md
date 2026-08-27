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

## Registro Controlado

El alta de cuentas exige un codigo de invitacion. La comprobacion no vive en el frontend: el trigger `handle_new_user` consume la invitacion en la misma transaccion que crea el usuario en Auth, asi que un alta sin codigo valido se deshace entera y no deja usuario.

- Tabla `public.store_invites`: RLS activa y sin politicas, mas `revoke` a `public`, `anon` y `authenticated`. Nadie la lee desde la aplicacion.
- Solo se guarda el SHA-256 del codigo normalizado. El codigo en claro se ve una vez, al emitirlo.
- `issue_store_invite` genera el codigo en el servidor y no esta concedida a `anon` ni a `authenticated`: se emite desde el editor SQL.
- `invite_is_available` es la unica funcion concedida a `anon`. Devuelve solo un booleano y sirve para el mensaje de error del formulario, no para autorizar.
- Todas las funciones `security definer` usan `set search_path = ''` y referencias cualificadas.
- Consumo de un solo uso y atomico mediante `update ... where used_count < max_uses`.

Para dar de alta a alguien a mano hace falta emitir un codigo y pasarlo en el metadata del usuario:

```sql
select public.issue_store_invite('para quien es');  -- devuelve el codigo una sola vez
-- luego, al crear el usuario: user_metadata = {"invite_code": "EL_CODIGO"}
```

Para revocar o reciclar una invitacion:

```sql
update public.store_invites set revoked_at = now() where id = '...';
update public.store_invites set used_count = 0, used_at = null, used_by = null where id = '...';
```

## Correo Saliente

El SMTP de Auth es Brevo, configurado en el panel de Supabase. Ni la clave SMTP ni ninguna credencial de Brevo estan en el repositorio.

Los correos de Auth (confirmacion de cuenta, recuperacion de contrasena) van dirigidos al duenno de la tienda. El futuro envio de resumenes a clientes es un flujo distinto: no debe salir de Supabase Auth, la clave del proveedor no puede estar en el frontend y el destinatario tiene que resolverse en servidor a partir del cliente y de la tienda del usuario, nunca aceptarse tal cual desde el navegador.
