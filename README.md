# La Libreta de Marcos

PWA mobile-first para llevar compras fiadas de una tienda pequena: clientes, compras, pagos, fotos opcionales de ticket y trazabilidad de anulaciones.

Estado actual: Fase 3B Subtrabajo 2 en preparacion para revision. La base versionada de este tramo es `1ecaf2a61d0728c9201b03467f8e7a2e2963d053`.

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
- Cuenta permite ver email, cambiar contrasena y cerrar sesion.

## Base De Datos

```bash
supabase start
supabase db reset
npm run test:security
```

Las migraciones versionadas estan en `supabase/migrations/`.

- `202608270001_initial_schema.sql`: tiendas, perfiles, clientes, tickets, pagos, RLS y Storage privado.
- `202608270002_add_client_reference_fields.sql`: apodo/referencia y nota corta de cliente.

El dinero se guarda siempre como centimos enteros (`amount_cents`). El saldo no se duplica: se calcula como tickets activos menos pagos no anulados.

Las anulaciones no borran movimientos. Tickets y pagos conservan autor, fecha y motivo de anulacion.

## Validación

```bash
npx vitest run
npx tsc -b --pretty false
npm run build
npm run test:security
```

Las pruebas unitarias cubren reglas economicas, busqueda, orden de clientes, recientes, umbral de importe alto y subida de fotos. Las pruebas pgTAP comprueban aislamiento entre tiendas, acceso anonimo, integridad de importes y trazabilidad de anulaciones.

## Seguridad

- RLS activa en tablas de negocio.
- Storage `ticket-photos` privado.
- Fotos servidas con signed URLs temporales.
- Sin service role en el frontend.
- Sin escritura economica offline.
- Auth real de Supabase; la recuperacion de contrasena usa Supabase Auth.

## Despliegue

La aplicacion se despliega en Vercel:

`https://marcos-tienda.vercel.app`

Antes de desplegar, ejecutar tests, TypeScript y build. Las URLs de redireccion de Supabase Auth deben permitir el dominio publico de Vercel.

## Documentación

- `docs/ARCHITECTURE.md`: arquitectura y modelo de datos.
- `docs/SECURITY.md`: RLS, Auth, Storage y secretos.
- `docs/DECISIONES.md`: decisiones de producto/UX/seguridad.
- `docs/CHANGELOG.md`: cambios por fase.
- `docs/PENDIENTES.md`: inventario vivo P0/P1/P2/fuera de alcance.
- `docs/PIN_NEXT.md`: siguiente mejora documentada, no implementada.
