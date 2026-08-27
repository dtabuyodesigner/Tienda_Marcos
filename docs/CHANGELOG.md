# Changelog

## `768487a6af929f6cf21f898b3df04f03a892f84f` - Cierre Fase 3B Subtrabajo 2

Base: `ab12c75b29c8213f009fb1ea3de5f180df035a91`. Se despliega en produccion automaticamente al hacer push a `master`.

### Cuenta

- La pantalla `Cuenta` ya no muestra el campo de contrasena nueva al entrar: primero aparece la accion secundaria `Cambiar contraseña`.
- Cambiar la contrasena exige reautenticacion con la contrasena actual, validada contra Supabase Auth.
- Tras reautenticar se piden `Nueva contraseña` y `Repetir nueva contraseña`, con validacion de coincidencia y minimo de 8 caracteres con letras y numeros.
- Anadida salida `He olvidado mi contraseña` que reutiliza el flujo de recuperacion de Supabase ya existente.
- `✓ Contraseña actualizada` solo se muestra tras confirmacion real de Supabase.
- Corregido el layout de `Email de acceso`: label y correo dejan de aparecer pegados; el email va debajo, con espaciado propio y corte de linea correcto en movil.
- `Cerrar sesión` se mantiene.

### Identidad e Inicio

- La cabecera sustituye `Hoy, con calma.` por `Covirán · San Miguel de las Dueñas · El Bierzo · León`, con jerarquia secundaria y wrap en movil.
- `+ Apuntar compra` y `Nuevo cliente` quedan alineados en el eje derecho en movil y escritorio.

### Correcciones de fiabilidad

- Si una compra o un cobro se guardan pero falla la lectura posterior del saldo, la aplicacion avisa en lugar de quedarse en silencio en el formulario.
- `Purchase` y `Charge` esperan de verdad al cierre de la operacion, cerrando la ventana en la que se podia registrar un segundo pago mientras se refrescaba el saldo.
- La pantalla de cobro no habilita `Paga todo` ni `Paga una parte` hasta conocer la deuda; si el cliente no debe nada, lo dice en vez de dejar botones que fallan.

### Verificado como ya existente en esta base

- Clientes recientes en `¿A quién se lo apuntamos?`, orden inteligente con deuda primero, tarjetas completas pulsables, confirmaciones de compra y de pago parcial/total, vista `Ver cuenta`, umbral de importe alto, apodo y nota opcionales, busqueda por nombre/apodo, seccion `Cuenta`, estados vacios, errores de conexion/guardado, foto del ticket con camara/selector y proteccion contra doble submit.
- `+ Nuevo cliente` desde la ficha, `Ver historial` como boton secundario y `Cobrar` oculto con saldo cero ya estaban implementados; en este tramo se consolidan con regla compartida y tests.

### Tests y documentacion

- Anadidos tests de interfaz con jsdom y Testing Library: ficha con saldo cero y con deuda, alta de cliente desde ficha y vuelta al cancelar, y la puerta de reautenticacion de `Cuenta`.
- Anadidas reglas puras `canChargeClient` y `passwordProblem` con sus tests.
- Documentacion actualizada: README, decisiones, pendientes y changelog.

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
