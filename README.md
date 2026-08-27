# La Libreta de Marcos

Base de la Fase 1 para una PWA mobile-first de compras fiadas. Esta fase deja preparado React, Vite, TypeScript, PWA, Supabase Auth, PostgreSQL, RLS y Storage privado. No incluye todavía las pantallas operativas de clientes, tickets o pagos.

## Requisitos

- Node.js 20 o posterior
- Supabase CLI para levantar Postgres local y ejecutar pruebas

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

Completar `.env` con la URL y la clave anon del proyecto. La service role key no se usa en el cliente ni debe añadirse a `.env` compartido.

## Base de datos

```bash
supabase start
supabase db reset
npm run test:security
```

La migración versionada en `supabase/migrations/` reconstruye todo el esquema. `supabase/seed.sql` contiene datos ficticios y deja los movimientos condicionados a un UUID de usuario Auth de desarrollo.

## Validación

```bash
npm run build
npm run test:security
```

Las pruebas pgTAP comprueban aislamiento entre tiendas, acceso anónimo, integridad de importes y trazabilidad de anulaciones.

## Estructura

- `src/`: cliente Supabase y login mínimo protegido.
- `supabase/migrations/`: esquema, constraints, índices, RLS y Storage.
- `supabase/tests/`: pruebas de aislamiento y seguridad.
- `docs/`: decisiones técnicas y modelo de amenazas.
