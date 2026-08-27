# Changelog

## Pendiente - Fase 3B Subtrabajo 2

Base: `1ecaf2a61d0728c9201b03467f8e7a2e2963d053`.

- Añadidos clientes recientes en la pantalla `¿A quién se lo apuntamos?`.
- Añadido orden inteligente: deuda primero, actividad reciente despues y nombre como desempate.
- La fila completa del cliente es pulsable.
- Añadidas confirmaciones claras tras compra, pago parcial y pago total.
- Añadido cobro destacado desde ficha y oculto cuando el saldo es cero.
- Añadida vista `Ver cuenta`.
- Añadido umbral configurable para confirmar importes anormalmente altos.
- Añadidos apodo/referencia y nota corta opcionales de cliente.
- Añadida busqueda por nombre y apodo.
- Añadida seccion minima `Cuenta`: email, cambio de contrasena y cierre de sesion.
- Mejorados estados vacios y errores de conexion/guardado.
- Mejorada presentacion de `Foto del ticket` manteniendo camara/selector.
- Añadido `+ Nuevo cliente` desde la ficha de cliente; cancelar vuelve a la ficha anterior y guardar abre la ficha nueva.
- Convertido `Ver historial` en boton secundario tactil.
- Documentacion actualizada: README, arquitectura, seguridad, decisiones y pendientes.

## `1ecaf2a61d0728c9201b03467f8e7a2e2963d053` - Refinamiento Movil Y Password Recovery

- `Nuevo cliente` visible como boton secundario en inicio.
- `+ Nuevo cliente` movido arriba en seleccion de cliente.
- `Fotografía` cambiado a `Foto del ticket`.
- Input de foto compatible con camara movil y selector de escritorio.
- Recuperacion real de contrasena mediante Supabase Auth.
- PIN documentado como siguiente mejora, no implementado.

## `9ccc48abb552bcc88919ca3a364d639abb14d1cb` - Deploy PWA Fase 3

- Preparacion del deploy funcional en Vercel.
- Validacion de variables publicas y configuracion de PWA.

## `a2ea3b7bdfb0e803eed72958318edf7d40d54f3f` - MVP Fase 2

- Flujo funcional de clientes, tickets, pagos, fotos y anulaciones.
- Tests minimos de reglas economicas y Storage.
- Validacion contra `Marcos_Tienda`.

## `686297989df37d0fb696f4fe82783eef0b24301a` - Correccion Triggers

- Separacion de triggers de pertenencia/autoria segun forma real de tabla.

## `fee78c8` - Base Fase 1

- Fundacion React, Vite, TypeScript, PWA, Supabase Auth, PostgreSQL, RLS y Storage privado.
