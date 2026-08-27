-- Registro de envios del resumen de cuenta.
--
-- Se implementa por dos motivos concretos, no por completitud: deja constancia
-- de que a un cliente se le envio su cuenta (quien, cuando y a que direccion), y
-- es el mecanismo con el que la Edge Function limita el ritmo de envio sin
-- montar infraestructura aparte.
--
-- NO se guarda el cuerpo del correo ni una copia de los movimientos: eso ya esta
-- en tickets y payments, y duplicarlo solo multiplicaria los sitios donde se
-- puede filtrar informacion de un cliente.

create table public.account_summary_sends (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  client_id uuid not null,
  sent_by uuid not null references auth.users(id),
  channel text not null check (channel in ('email')),
  recipient text not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, client_id) references public.clients(store_id, id)
);

create index account_summary_sends_recent_idx on public.account_summary_sends (store_id, client_id, created_at desc);

alter table public.account_summary_sends enable row level security;

-- Mismo criterio que el resto del negocio: cada tienda ve y escribe lo suyo, y
-- el autor tiene que ser el propio usuario autenticado.
create policy account_summary_sends_select_own_store on public.account_summary_sends for select to authenticated
using (store_id = (select public.current_store_id()));

create policy account_summary_sends_insert_own_store on public.account_summary_sends for insert to authenticated
with check (store_id = (select public.current_store_id()) and sent_by = (select auth.uid()));

-- Sin politicas de update ni delete: un registro de envio no se reescribe.
