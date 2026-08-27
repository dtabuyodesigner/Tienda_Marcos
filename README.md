# La Libreta de Marcos

PWA mobile-first para llevar compras fiadas de una tienda pequena: clientes, compras, pagos, fotos opcionales de ticket y trazabilidad de anulaciones.

Estado actual: registro controlado por invitacion y ayuda integrada en marcha. Las migraciones `202608270001` a `202608270005` estan aplicadas en `Marcos_Tienda`. La aplicacion esta desplegada y en prueba manual real.

## Requisitos

- Node.js 20 o posterior
- Supabase CLI para migraciones y pruebas de seguridad
- Proyecto Supabase `Marcos_Tienda`

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completar `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La service role key no se usa en el frontend ni debe versionarse.

## Flujo operativo

- Alta de cuenta desde la pantalla de acceso, solo con codigo de invitacion. Crea tienda y perfil automaticamente. Ver `docs/SECURITY.md` para emitir una invitacion.
- Auth exige confirmar el email antes de la primera entrada. Para entregarla a una tienda real hay que configurar SMTP propio en Supabase y permitir el dominio publico en las URLs de redireccion.
- `Ayuda` dentro de la aplicacion, en el menu de usuario.
- Login mediante Supabase Auth.
- Inicio con total pendiente, clientes ordenados por deuda primero y actividad reciente como criterio secundario.
- Alta de cliente con nombre, telefono opcional, apodo/referencia opcional y nota corta opcional.
- Compra nueva con importe en euros, concepto opcional y foto opcional del ticket.
- Cobro parcial o total desde la ficha del cliente.
- `Ver cuenta` muestra saldo y movimientos pendientes.
- Historial conserva compras y pagos anulados.
- Desde la ficha de un cliente se puede crear otro cliente sin volver a Inicio: al guardar se abre la ficha nueva y al cancelar se vuelve a la ficha anterior.
- `Cobrar` solo aparece cuando el cliente debe algo.
- Foto opcional del cliente: se puede anadir al crearlo o despues desde su ficha, y cambiarla o quitarla. Es solo una ayuda visual; se guarda en Storage privado y se lee con signed URL temporal.
- La ficha incluye un `Resumen` con movimientos de deuda activos, ultima compra, ultimo pago, total apuntado y total pagado.
- `Añadir saldo anterior` registra la deuda que el cliente ya tenia en tickets de papel antes de empezar a usar la aplicacion. Es un unico movimiento con origen propio, no una compra inventada, y aparece en el historial como `Saldo anterior`.
- Cuenta permite ver el email, cambiar la contrasena y cerrar sesion. El cambio de contrasena exige reautenticacion con la contrasena actual antes de mostrar los campos de contrasena nueva.

## Base De Datos

```bash
supabase start
supabase db reset
npm run test:security
```

Las migraciones versionadas estan en `supabase/migrations/`.

- `202608270001_initial_schema.sql`: tiendas, perfiles, clientes, tickets, pagos, RLS y Storage privado.
- `202608270002_add_client_reference_fields.sql`: apodo/referencia y nota corta de cliente.
- `202608270003_add_movement_origin.sql`: origen del movimiento (`purchase` / `opening_balance`) para el saldo anterior a La Libreta.
- `202608270004_add_client_photo.sql`: referencia opcional a la foto del cliente en Storage privado.
- `202608270005_add_store_invites.sql`: invitaciones de un solo uso y alta de cuenta solo con invitacion.

El dinero se guarda siempre como centimos enteros (`amount_cents`). El saldo no se duplica: se calcula como tickets activos menos pagos no anulados.

Las anulaciones no borran movimientos. Tickets y pagos conservan autor, fecha y motivo de anulacion.

## Validación

```bash
npx vitest run
npx tsc -b --pretty false
npm run build
npm run test:security
```

Las pruebas unitarias cubren reglas economicas, busqueda, orden de clientes, recientes, umbral de importe alto, reglas de contrasena, saldo anterior y subida de fotos. Las pruebas de interfaz se ejecutan con jsdom y Testing Library y cubren la ficha de cliente con y sin deuda, el alta de cliente desde la ficha y la reautenticacion de `Cuenta`. Las pruebas pgTAP comprueban aislamiento entre tiendas, acceso anonimo, integridad de importes, trazabilidad de anulaciones y las reglas del saldo anterior. `npm run test:security` necesita Supabase CLI y Docker; donde no esten disponibles, esas pruebas no se pueden ejecutar y no deben darse por pasadas.

## Seguridad

- RLS activa en tablas de negocio.
- Storage `ticket-photos` privado.
- Fotos servidas con signed URLs temporales.
- Sin service role en el frontend.
- Sin escritura economica offline.
- Auth real de Supabase; la recuperacion de contrasena usa Supabase Auth.
- Las operaciones sensibles de cuenta exigen reautenticacion; las contrasenas no se guardan en estado persistente, logs ni almacenamiento local.

## Despliegue

La aplicacion se despliega en Vercel:

`https://marcos-tienda.vercel.app`

Vercel esta conectado a este repositorio y despliega automaticamente: cada push a `master` crea un deployment de produccion, sin promocion manual. Por eso `master` solo debe recibir codigo que ya pase tests, TypeScript y build. Las URLs de redireccion de Supabase Auth deben permitir el dominio publico de Vercel.

## Documentación

- `docs/ARCHITECTURE.md`: arquitectura y modelo de datos.
- `docs/SECURITY.md`: RLS, Auth, Storage y secretos.
- `docs/DECISIONES.md`: decisiones de producto/UX/seguridad.
- `docs/CHANGELOG.md`: cambios por fase.
- `docs/PENDIENTES.md`: inventario vivo P0/P1/P2/fuera de alcance.
- `docs/PIN_NEXT.md`: siguiente mejora documentada, no implementada.

