# Decisiones

## Estado Del Proyecto

- Producto: `La Libreta de Marcos`, PWA para fiados de tienda.
- Proyecto Supabase: `Marcos_Tienda`.
- Deploy publico: `https://marcos-tienda.vercel.app`.
- SHA base de Fase 3B Subtrabajo 2: `1ecaf2a61d0728c9201b03467f8e7a2e2963d053`.

## Arquitectura

- Frontend React + Vite + TypeScript.
- Supabase Auth para identidad y sesion.
- PostgreSQL con RLS como frontera real de seguridad.
- Storage privado para fotos de tickets.
- Vercel para despliegue de la PWA.

## Dinero

- Todos los importes economicos se convierten a centimos enteros antes de guardar.
- No se usan floats para saldo ni movimientos.
- El saldo se deriva de tickets activos menos pagos no anulados.
- Tickets y pagos se anulan con trazabilidad; no se borran como operacion normal.
- Los importes anormalmente altos requieren confirmacion con umbral configurable en codigo.

## Seguridad

- El frontend no contiene service role key ni secretos.
- La anon key solo permite lo que RLS autoriza.
- Cada tabla de negocio lleva `store_id`.
- Las FKs compuestas impiden mezclar clientes y movimientos de tiendas distintas.
- El bucket `ticket-photos` es privado y las fotos se visualizan mediante signed URLs temporales.

## Flujo De Marcos

- Inicio muestra el total pendiente y acceso principal a `+ Apuntar compra`.
- Los clientes con deuda se muestran primero; despues aparecen clientes a cero.
- El criterio secundario es actividad economica reciente; si empata, nombre alfabetico.
- En `¿A quién se lo apuntamos?`, `+ Nuevo cliente` aparece antes del listado y se muestran clientes recientes.
- La fila completa del cliente es pulsable para uso tactil.
- La ficha del cliente concentra `+ Nueva compra`, `Cobrar` cuando hay deuda, `Ver cuenta`, `Ver historial` y `+ Nuevo cliente`.
- Si se crea un cliente desde una ficha, cancelar vuelve a la ficha anterior y guardar abre la ficha nueva.

## UX

- `+ Apuntar compra` y `+ Nueva compra` son acciones principales.
- `Nuevo cliente`, `Ver historial` y `Ver cuenta` mantienen jerarquia secundaria.
- `Cobrar` se oculta cuando el saldo es cero para evitar una accion imposible.
- Las confirmaciones de compra, pago parcial y pago total muestran el saldo actualizado.
- Los estados vacios usan lenguaje natural.
- Los errores de carga/guardado evitan mostrar falso exito.

## Fotos

- La foto del ticket es opcional.
- En movil se usa `accept="image/*"` y `capture="environment"` para abrir camara trasera cuando el navegador lo soporte.
- En escritorio se mantiene selector de archivo.
- Si falla la subida de foto, el ticket no se duplica; se permite reintentar la foto.

## Auth Y Cuenta

- Login, sesion y recuperacion de contrasena se hacen con Supabase Auth.
- La vista `Cuenta` muestra email, permite cambiar contrasena y cerrar sesion.
- Las redirect URLs de Supabase deben permitir `https://marcos-tienda.vercel.app`.

## Funciones Aplazadas

- PIN local: aplazado. Debe ser solo desbloqueo rapido sobre una sesion Supabase valida, sin guardar PIN en texto plano.
- Migracion inicial de saldos desde papel: P1 alta antes de implantacion real.
- WhatsApp, PDF, OCR, catalogo, inventario, TPV, pedidos desde casa y escritura economica offline quedan fuera de esta fase.
