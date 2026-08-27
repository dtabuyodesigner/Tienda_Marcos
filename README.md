# La Libreta de Marcos

PWA mobile-first para llevar compras fiadas de una tienda pequena: clientes, compras, pagos, fotos opcionales de ticket y trazabilidad de anulaciones.

Estado actual: Fase 3B Subtrabajo 2 cerrado y validado en `768487a6af929f6cf21f898b3df04f03a892f84f`, sobre la base `ab12c75b29c8213f009fb1ea3de5f180df035a91`. La aplicacion esta desplegada y en prueba manual real.

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

- Login mediante Supabase Auth.
- Inicio con total pendiente, clientes ordenados por deuda primero y actividad reciente como criterio secundario.
- Alta de cliente con nombre, telefono opcional, apodo/referencia opcional y nota corta opcional.
- Compra nueva con importe en euros, concepto opcional y foto opcional del ticket.
- Cobro parcial o total desde la ficha del cliente.
- `Ver cuenta` muestra saldo y movimientos pendientes.
- Historial conserva compras y pagos anulados.
- Desde la ficha de un cliente se puede crear otro cliente sin volver a Inicio: al guardar se abre la ficha nueva y al cancelar se vuelve a la ficha anterior.
- `Cobrar` solo aparece cuando el cliente debe algo.
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

