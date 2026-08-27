-- Email opcional del cliente.
--
-- Solo es un dato de contacto para un envio manual futuro. Hoy no se envia
-- nada: ni recordatorios, ni campanas, ni avisos automaticos.
--
-- No se crea indice: no se busca por email en ninguna consulta. Indexar por
-- costumbre solo anadiria escritura sin ninguna lectura que lo aproveche.
--
-- RLS: hereda las politicas de `clients`, que ya filtran por tienda. No hace
-- falta ninguna politica nueva.

alter table public.clients add column email text;

-- La aplicacion guarda el email ya normalizado. Aqui solo se impide lo absurdo:
-- que llegue con mayusculas o espacios, sin arroba, sin punto en el dominio o
-- absurdamente largo. La validacion fina de formato vive en la aplicacion.
alter table public.clients
  add constraint clients_email_shape
  check (
    email is null
    or (email = lower(btrim(email)) and email like '%_@_%.__%' and length(email) <= 254)
  );
