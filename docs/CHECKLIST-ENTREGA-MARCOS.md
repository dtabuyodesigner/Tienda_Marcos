# Checklist para entregar La Libreta a Marcos

Lista practica. No es un manual: es lo que hay que comprobar y hacer.

## Antes de entregarla

- [ ] **Produccion responde**: abrir `https://marcos-tienda.vercel.app` y que cargue.
- [ ] **BLOQUEANTE — el correo de confirmacion llega.** Registrar una cuenta de prueba y comprobar que el correo aparece en la bandeja. Si no llega, Marcos no puede entrar y no se le entrega. Ver `docs/PENDIENTES.md` para el diagnostico actual.
- [ ] **Recuperar contrasena funciona**: pedir el enlace y comprobar que llega.
- [ ] **Emitir su invitacion**: en el editor SQL de Supabase, `select public.issue_store_invite('Marcos');`. Devuelve el codigo UNA sola vez: copiarlo y guardarlo para dárselo.
- [ ] **Comprobar que entra**: con esa invitacion, crear cuenta y llegar a Inicio.
- [ ] **Apuntar una compra y cobrarla** en una tienda de prueba, para ver que los numeros cuadran.
- [ ] **Compartir una cuenta** por email, PDF y WhatsApp con un cliente de prueba.
- [ ] **Instalar la PWA** en un movil y abrirla desde el icono.
- [ ] **Borrar los datos de prueba** antes de darsela.

## El dia que se la instalas en su movil

1. Abrir `https://marcos-tienda.vercel.app` en Chrome.
2. Menu del navegador -> **Anadir a pantalla de inicio**. A partir de ahi se abre como una aplicacion.
3. **Crear su cuenta** con el codigo de invitacion: su nombre, su email, una contrasena que recuerde y el nombre de la tienda.
4. Confirmar el correo desde el propio movil.
5. Iniciar sesion.
6. Si quiere, en **Cuenta -> Bloqueo con PIN**, activar un PIN de 4 a 6 cifras y elegir cada cuanto se bloquea. Explicarle que el PIN es solo de ese movil: si cierra sesion, para volver a entrar necesita su email y su contrasena.
7. **Crear su primer cliente real** delante de el, para que vea lo poco que cuesta.

## Los primeros dias

- **No pasar la libreta entera de golpe.** Ir metiendo clientes segun vayan apareciendo por la tienda.
- Para lo que ya debian de antes, usar **Anadir saldo anterior** en su ficha: es un unico apunte, no hay que inventar compras.
- Comprobar un par de cobros con el cliente delante, para coger confianza con `Paga todo` y `Paga una parte`.
- Si se equivoca, **anular** el movimiento y volver a apuntarlo bien. No se borra nada: queda en el historial.
- **Que avise de cualquier cosa rara**, por pequena que sea. Las mejores mejoras han salido de usarla de verdad.

## Que decirle en una frase

Que apunte como apuntaba en el papel. La aplicacion hace las cuentas sola.
