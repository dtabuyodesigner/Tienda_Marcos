-- Saldo inicial / deuda anterior a La Libreta de Marcos.
--
-- Decision de modelo: se conserva el modelo economico actual. Un saldo anterior
-- sigue siendo un movimiento que aumenta la deuda y vive en `tickets`, pero
-- lleva un origen explicito para no confundirlo nunca con una compra real de
-- mostrador. Asi el calculo de saldo, la anulacion con trazabilidad, la RLS por
-- tienda y la integridad cross-store siguen siendo exactamente los mismos.

create type public.movement_origin as enum ('purchase', 'opening_balance');

-- Las filas existentes quedan como 'purchase': no habia otra cosa antes.
alter table public.tickets
  add column origin public.movement_origin not null default 'purchase';

-- Un saldo anterior no se fotografia: representa deuda agregada de papel,
-- no un ticket concreto que se pueda adjuntar.
alter table public.tickets
  add constraint tickets_opening_balance_without_photo
  check (origin = 'purchase' or photo_path is null);

-- Un cliente solo puede tener un saldo anterior vivo. Es la defensa en base de
-- datos contra el doble envio y contra registrar dos veces la misma deuda de
-- papel: duplicar deuda es el error caro. Para corregirlo se anula y se vuelve
-- a registrar el importe correcto.
create unique index tickets_single_active_opening_balance_idx
  on public.tickets (store_id, client_id)
  where origin = 'opening_balance' and status = 'active';

create index tickets_origin_idx on public.tickets (store_id, origin);

-- El origen es historico: no se reescribe despues de crear el movimiento.
-- Va en su propio trigger porque `payments` no tiene esta columna y
-- `protect_movement_fields` es compartida por ambas tablas.
create or replace function public.protect_ticket_origin()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.origin is distinct from old.origin then
    raise exception 'El origen del movimiento no se puede modificar';
  end if;
  return new;
end;
$$;

create trigger tickets_protect_origin before update on public.tickets
for each row execute function public.protect_ticket_origin();
