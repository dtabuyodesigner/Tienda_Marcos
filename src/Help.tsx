export function Help({ onBack }: { onBack: () => void }) {
  return (
    <section className="page">
      <button className="back" onClick={onBack}>← Volver</button>
      <h1>Ayuda</h1>

      <p className="help-intro">
        Aquí tienes, en cristiano, las cosas que vas a hacer todos los días en la tienda.
        Toca una pregunta y se abre la respuesta.
      </p>

      <h2 className="help-section">Clientes</h2>

      <details className="help-item">
        <summary>¿Cómo doy de alta a un cliente?</summary>
        <div className="help-answer">
          <p>
            Entra en <strong>Clientes</strong> y dale a añadir. Lo único obligatorio es el
            <strong> nombre</strong>. Con eso ya puedes empezar a apuntarle compras.
          </p>
          <p>
            El <strong>apodo o referencia</strong>, la <strong>nota</strong> y la
            <strong> foto</strong> son opcionales. Ponlos si te ayudan, y si no, déjalos en blanco.
          </p>
        </div>
      </details>

      <details className="help-item">
        <summary>¿Para qué sirve el apodo?</summary>
        <div className="help-answer">
          <p>
            Para encontrar al cliente rápido cuando tienes gente esperando. Si en el pueblo le
            llamáis «Pepe el de la plaza», ponlo tal cual en el apodo: luego escribes
            «plaza» en el buscador y te sale él, aunque en el nombre ponga «José».
          </p>
          <p>
            La nota es para lo que quieras recordar («paga los viernes», «es el hijo de Carmen»),
            y la foto para no confundir a dos que se llaman igual.
          </p>
        </div>
      </details>

      <h2 className="help-section">Apuntar compras</h2>

      <details className="help-item">
        <summary>¿Cómo apunto una compra fiada?</summary>
        <div className="help-answer">
          <p>
            Cobras como siempre en la caja, y si el cliente te dice «apúntamelo», haces esto:
          </p>
          <ol className="help-steps">
            <li>Abres la app en el móvil.</li>
            <li>Buscas al cliente y entras en su ficha.</li>
            <li>Le das a apuntar compra.</li>
            <li>Pones el importe del ticket.</li>
            <li>Si quieres, le haces la foto al ticket.</li>
            <li>Guardas, y esperas a ver el aviso de que se ha guardado.</li>
          </ol>
          <p>
            En cuanto lo guardas, esa cantidad se suma a lo que te debe.
          </p>
        </div>
      </details>

      <details className="help-item">
        <summary>¿Tengo que hacerle foto al ticket?</summary>
        <div className="help-answer">
          <p>
            No, es opcional. La compra se apunta igual de bien sin foto.
          </p>
          <p>
            Pero la foto te salva cuando pasan quince días y alguien te dice «yo eso no me lo
            llevé». Abres el historial, enseñas la foto del ticket y se acabó la discusión.
            Si el importe es gordo o el cliente es de discutir, hazla.
          </p>
        </div>
      </details>

      <h2 className="help-section">Cobrar</h2>

      <details className="help-item">
        <summary>¿Cómo apunto que un cliente me ha pagado?</summary>
        <div className="help-answer">
          <p>
            En la ficha del cliente tienes dos botones:
          </p>
          <ul className="help-list">
            <li>
              <strong>Paga todo</strong>: cuando te salda la cuenta entera. La app pone sola el
              total que debía y su deuda se queda a cero.
            </li>
            <li>
              <strong>Paga una parte</strong>: cuando te da algo a cuenta. Escribes tú cuánto
              te ha dado y el resto sigue pendiente.
            </li>
          </ul>
        </div>
      </details>

      <details className="help-item">
        <summary>Pedrito me paga solo 20 €. ¿Qué hago?</summary>
        <div className="help-answer">
          <p>
            Entras en la ficha de Pedrito, le das a <strong>Paga una parte</strong>, escribes
            <strong> 20</strong> y guardas.
          </p>
          <p>
            Si Pedrito debía 86 €, en cuanto veas la confirmación su deuda pasará a 66 €.
            No hace falta que hagas ninguna cuenta a mano: la app resta sola.
          </p>
        </div>
      </details>

      <h2 className="help-section">Errores y correcciones</h2>

      <details className="help-item">
        <summary>He apuntado 48 € y eran 18 €. ¿Cómo lo corrijo?</summary>
        <div className="help-answer">
          <p>Se arregla en dos pasos:</p>
          <ol className="help-steps">
            <li>
              Busca esa compra de 48 € en el <strong>Historial</strong> del cliente y
              <strong> anúlala</strong>. Te pedirá un motivo: escribe algo claro, por ejemplo
              «me equivoqué al teclear, eran 18 €».
            </li>
            <li>
              Apunta otra compra, ahora con el importe bueno: <strong>18 €</strong>.
            </li>
          </ol>
          <p>
            La deuda queda correcta y en el historial se ve lo que pasó.
          </p>
        </div>
      </details>

      <details className="help-item">
        <summary>¿Por qué no puedo borrar una compra o un cobro?</summary>
        <div className="help-answer">
          <p>
            Porque el dinero no se borra: se <strong>anula</strong>. Es la misma norma de toda la
            vida en los libros de cuentas, y es lo que te protege si un cliente te reclama.
          </p>
          <p>
            Al anular tienes que poner el motivo. El movimiento anulado <strong>deja de contar</strong>
            {' '}en la deuda al momento, pero sigue apareciendo en el historial marcado como anulado,
            con el motivo que escribiste. Así siempre puedes explicar por qué cambió una cuenta.
          </p>
        </div>
      </details>

      <h2 className="help-section">Deudas de antes</h2>

      <details className="help-item">
        <summary>Pedrito ya me debía 86,40 € en papeles. ¿Dónde lo meto?</summary>
        <div className="help-answer">
          <p>
            Eso va en <strong>Saldo anterior</strong>. Entras en la ficha de Pedrito, eliges
            <strong> Saldo anterior</strong>, pones <strong>86,40</strong> y guardas. A partir de
            ahí, todo lo nuevo se le va sumando encima.
          </p>
          <p>
            <strong>Ojo</strong>: el saldo anterior es solo para lo que ya debía <em>antes</em> de
            que empezaras a usar la app, lo que tenías en los papelitos. Una compra de hoy
            <strong> no</strong> se mete por ahí: esa se apunta como compra normal.
          </p>
        </div>
      </details>

      <h2 className="help-section">Ver lo que te deben</h2>

      <details className="help-item">
        <summary>¿Cómo veo lo que me debe alguien?</summary>
        <div className="help-answer">
          <p>
            Entra en su ficha: arriba, en grande, tienes la <strong>deuda</strong> que tiene ahora
            mismo. Es la cifra que le dices al cliente cuando pregunta «¿cuánto llevo?».
          </p>
          <p>
            Debajo tienes dos vistas:
          </p>
          <ul className="help-list">
            <li>
              <strong>Ver cuenta</strong>: lo que queda pendiente, o sea de dónde sale esa cifra.
            </li>
            <li>
              <strong>Historial</strong>: absolutamente todo lo que ha pasado en esa cuenta, por
              orden, incluidos los movimientos anulados y su motivo.
            </li>
          </ul>
          <p>
            En la lista de clientes también ves de un vistazo quién te debe y cuánto.
          </p>
        </div>
      </details>

      <h2 className="help-section">Tu cuenta y tu contraseña</h2>

      <details className="help-item">
        <summary>He olvidado la contraseña. ¿Cómo entro?</summary>
        <div className="help-answer">
          <p>
            En la pantalla de acceso toca <strong>«¿Has olvidado tu contraseña?»</strong>, escribe
            tu correo y envía.
          </p>
          <p>
            Te llegará un <strong>email con un enlace</strong>. Ábrelo desde el móvil, pon la
            contraseña nueva y ya puedes entrar. Si no lo ves, mira en la carpeta de correo no
            deseado.
          </p>
        </div>
      </details>

      <details className="help-item">
        <summary>¿Cómo cambio la contraseña?</summary>
        <div className="help-answer">
          <p>
            En la pantalla <strong>Cuenta</strong>. Ahí ves tu correo, puedes cambiar la
            contraseña y también cerrar sesión.
          </p>
          <p>
            Antes de dejarte cambiarla te pide la <strong>contraseña de ahora</strong>. Es a
            propósito: si dejas el móvil desbloqueado en el mostrador y alguien lo coge, no podrá
            cambiarte la contraseña ni dejarte fuera de tu cuenta sin saber la actual.
          </p>
        </div>
      </details>

      <h2 className="help-section">Sin cobertura</h2>

      <details className="help-item">
        <summary>Me he quedado sin Internet. ¿Qué pasa con lo que apunte?</summary>
        <div className="help-answer">
          <p>
            La regla es una y muy sencilla: <strong>hasta que la app no te dice en pantalla que se
            ha guardado, no está guardado</strong>.
          </p>
          <p>
            Si le das a guardar y no ves la confirmación, o te sale un aviso de error, esa compra o
            ese cobro <strong>no se ha apuntado</strong>. Anótalo en un papel, y cuando vuelva la
            cobertura lo metes otra vez en la app.
          </p>
          <p>
            No des por hecho que se guardó «porque le di». Mira siempre la confirmación antes de
            guardar el móvil en el bolsillo.
          </p>
        </div>
      </details>

      <details className="help-item">
        <summary>¿Y si lo apunto dos veces sin querer?</summary>
        <div className="help-answer">
          <p>
            No pasa nada. Entra en el <strong>Historial</strong> del cliente, anula el movimiento
            repetido y pon como motivo «apuntado dos veces». La deuda se queda como tiene que
            quedarse.
          </p>
        </div>
      </details>
    </section>
  )
}
