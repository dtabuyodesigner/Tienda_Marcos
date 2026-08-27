# Plantillas de correo de Auth (español)

Estas plantillas **se aplican a mano en el Dashboard de Supabase**. No se pueden
aplicar por API ni por migración porque hacen falta credenciales de la
Management API, y este proyecto no las tiene. Lo que hay aquí está listo para
copiar y pegar tal cual.

## Dónde se pegan

Dashboard de Supabase → proyecto → **Authentication** → **Emails** → pestaña
**Templates**.

URL directa (sustituyendo el proyecto activo):
`https://supabase.com/dashboard/project/_/auth/templates`

Para cada plantilla hay dos campos: **Subject heading** (asunto) y el cuerpo en
HTML. Se pega el asunto en el primero y el bloque HTML completo en el segundo, y
se pulsa **Save**.

## Variables oficiales disponibles

Fuente: <https://supabase.com/docs/guides/auth/auth-email-templates> (sección
*Terminology*). El motor de plantillas es Go, así que la sintaxis exacta es
`{{ .Nombre }}` con el punto delante.

| Variable | Dónde es válida |
| --- | --- |
| `{{ .ConfirmationURL }}` | Confirm signup, Invite user, Magic Link, Change email, Reset password |
| `{{ .Token }}` | Magic Link / OTP, Reauthentication (código de 6 dígitos) |
| `{{ .TokenHash }}` | Todas las de autenticación (para construir enlaces a mano) |
| `{{ .SiteURL }}` | Todas |
| `{{ .RedirectTo }}` | Todas las de autenticación |
| `{{ .Data }}` | Todas (metadatos del usuario) |
| `{{ .Email }}` | Todas |
| `{{ .NewEmail }}` | Solo Change email address |
| `{{ .OldEmail }}` | Solo la notificación de email cambiado |
| `{{ .Phone }}` / `{{ .OldPhone }}` | Solo la notificación de teléfono cambiado |
| `{{ .Provider }}` | Solo las notificaciones de método de acceso vinculado/eliminado |
| `{{ .FactorType }}` | Solo las notificaciones de método de verificación añadido/eliminado |

Aquí usamos únicamente `{{ .ConfirmationURL }}`. Es la opción correcta para este
proyecto: la app llama a `signUp` con `emailRedirectTo` y a
`resetPasswordForEmail` con `redirectTo` apuntando a la raíz del sitio, y
`ConfirmationURL` ya incorpora ese destino. La alternativa con `{{ .TokenHash }}`
exigiría una ruta `/auth/confirm` propia que hoy no existe.

---

## 1. Confirmación de cuenta (Confirm signup)

**Asunto:**

```text
Confirma tu cuenta — La Libreta de Marcos
```

**Cuerpo HTML:**

```html
<!-- Plantilla: Confirm signup. Estilos en linea: los clientes de correo ignoran el CSS externo. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf9f5;margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;border:1px solid #e6e3dc;">
        <tr>
          <td style="padding:28px 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:18px;font-weight:bold;color:#002446;">La Libreta de Marcos</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1b1c1a;">
            <p style="margin:0 0 16px 0;">Hola,</p>
            <p style="margin:0 0 16px 0;">Has creado una cuenta en La Libreta de Marcos.</p>
            <p style="margin:0 0 24px 0;">Pulsa el botón para confirmar tu correo electrónico y terminar el registro.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 24px 24px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background-color:#2c694e;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;text-decoration:none;padding:14px 28px;border-radius:8px;">Confirmar mi cuenta</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1b1c1a;">
            <p style="margin:0 0 8px 0;">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
            <p style="margin:0 0 20px 0;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#002446;">{{ .ConfirmationURL }}</a></p>
            <p style="margin:0 0 20px 0;">Si no has solicitado esta cuenta, puedes ignorar este mensaje.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 28px 24px;border-top:1px solid #e6e3dc;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#002446;">
            <p style="margin:16px 0 0 0;">La Libreta de Marcos</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 2. Recuperación de contraseña (Reset password)

**Asunto:**

```text
Restablece tu contraseña — La Libreta de Marcos
```

**Cuerpo HTML:**

```html
<!-- Plantilla: Reset password. Estilos en linea: los clientes de correo ignoran el CSS externo. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf9f5;margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;border:1px solid #e6e3dc;">
        <tr>
          <td style="padding:28px 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:18px;font-weight:bold;color:#002446;">La Libreta de Marcos</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1b1c1a;">
            <p style="margin:0 0 16px 0;">Hola,</p>
            <p style="margin:0 0 16px 0;">Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.</p>
            <p style="margin:0 0 24px 0;">Pulsa el siguiente botón para elegir una nueva contraseña.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 24px 24px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background-color:#002446;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;text-decoration:none;padding:14px 28px;border-radius:8px;">Cambiar mi contraseña</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1b1c1a;">
            <p style="margin:0 0 8px 0;">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
            <p style="margin:0 0 20px 0;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#002446;">{{ .ConfirmationURL }}</a></p>
            <p style="margin:0 0 20px 0;">Si no has solicitado este cambio, puedes ignorar este mensaje.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 28px 24px;border-top:1px solid #e6e3dc;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#002446;">
            <p style="margin:16px 0 0 0;">La Libreta de Marcos</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 3. El resto de plantillas: qué hacemos con cada una

Contexto que decide todo lo de abajo: este proyecto usa **solo email +
contraseña**. No hay ningún proveedor social activo, ni magic link, ni acceso por
teléfono, ni MFA. El registro es privado y va por nuestra propia tabla
`store_invites`, no por la invitación de Auth.

### Plantillas de autenticación

| Plantilla (nombre en el Dashboard) | ¿Puede llegarle hoy a alguien? | Recomendación |
| --- | --- | --- |
| **Confirm signup** | Sí, en cada alta | Traducida (sección 1) |
| **Reset password** | Sí, desde "he olvidado mi contraseña" | Traducida (sección 2) |
| **Magic Link** | No | **No tocar.** No se llama nunca a `signInWithOtp`. Traducirla sería trabajo que nadie va a leer |
| **Invite user** | No | **No tocar.** Las invitaciones son nuestras (`store_invites`), no se usa `inviteUserByEmail` de Auth. El único disparador sería invitar a mano desde el Dashboard |
| **Change Email Address** | No hoy, pero es barato dejarlo previsto | **No tocar de momento.** La app no expone cambio de email. Si algún día se añade, esta es la primera que hay que traducir, y es la única donde valen `{{ .Email }}` y `{{ .NewEmail }}` |
| **Reauthentication** | No | **No tocar.** Solo se envía si se exige reautenticación con `{{ .Token }}` antes de operaciones sensibles, y no está activado |

### Plantillas de notificación de seguridad

Supabase también trae avisos automáticos: **Password Changed**, **Email Address
Changed**, **Phone Number Changed**, **Sign-in Method Linked**, **Sign-in Method
Removed**, **Verification Method Added**, **Verification Method Removed**.

- **Password Changed** es la única con posibilidad real de dispararse aquí (tras
  usar el flujo de recuperación), y solo si esas notificaciones están habilitadas
  en el proyecto. Si se ve que llega en inglés, se traduce entonces.
- Las de **teléfono**, **método de acceso vinculado/eliminado** y **método de
  verificación** son imposibles en este proyecto: no hay login por teléfono, ni
  proveedores sociales que vincular, ni MFA. **No tocar.**

Resumen: hoy solo merecen traducción **Confirm signup** y **Reset password**. El
resto son plantillas que ningún usuario de esta tienda puede recibir, y
traducirlas por inercia solo añade sitios donde el texto se puede quedar
desactualizado.

---

## Nota sobre el remitente

El remitente y el envío SMTP ya están configurados aparte, con **Brevo**
(Authentication → Emails → SMTP Settings). Estas plantillas **solo cambian el
asunto y el cuerpo** del correo: no afectan al nombre ni a la dirección desde la
que se envía, ni a los límites de envío. Si hay que cambiar el remitente, se hace
en la configuración de SMTP, no aquí.
