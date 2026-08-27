-- Foto opcional del cliente.
--
-- Decision de Storage: NO se crea un bucket nuevo. Se reutiliza el bucket
-- privado `ticket-photos` con un prefijo de ruta separado:
--
--   <store_id>/client-photos/<client_id>/<uuid>.jpg
--
-- Motivo: las politicas de `storage.objects` que ya existen autorizan por el
-- primer segmento de la ruta (`split_part(name, '/', 1) = current_store_id()`),
-- que es exactamente la regla que necesita un avatar de cliente. Reutilizarlas
-- significa cero politicas nuevas que revisar y una sola frontera de seguridad
-- que mantener, en vez de dos. Un bucket nuevo obligaria a duplicar cuatro
-- politicas identicas sin ganar ninguna garantia.
--
-- No hay colision con las rutas de tickets (`<store_id>/<client_id>/<ticket_id>/...`)
-- porque el segundo segmento de un ticket es siempre un UUID y aqui es el
-- literal `client-photos`.
--
-- La imagen no se guarda en la base de datos: `clients.photo_path` solo guarda
-- la referencia al objeto de Storage. La lectura siempre es con signed URL
-- temporal; nunca hay URL publica permanente.

alter table public.clients add column photo_path text;

-- La ruta debe empezar por la tienda del propio cliente: impide referenciar
-- desde una tienda un objeto que vive bajo el prefijo de otra.
alter table public.clients
  add constraint clients_photo_path_within_store
  check (photo_path is null or photo_path like (store_id::text || '/client-photos/%'));
