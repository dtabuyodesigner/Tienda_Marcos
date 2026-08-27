create extension if not exists "pgcrypto";

create type public.profile_role as enum ('owner', 'staff');
create type public.ticket_status as enum ('active', 'voided');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  display_name text not null check (length(btrim(display_name)) > 0),
  role public.profile_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(btrim(name)) > 0),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  client_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  concept text,
  photo_path text,
  status public.ticket_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  unique (store_id, id),
  foreign key (store_id, client_id) references public.clients(store_id, id),
  check ((status = 'active' and voided_at is null and voided_by is null) or
         (status = 'voided' and voided_at is not null and voided_by is not null)),
  check (status = 'active' or length(btrim(coalesce(void_reason, ''))) > 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  client_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  unique (store_id, id),
  foreign key (store_id, client_id) references public.clients(store_id, id),
  check ((voided_at is null and voided_by is null) or
         (voided_at is not null and voided_by is not null)),
  check (voided_at is null or length(btrim(coalesce(void_reason, ''))) > 0)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_set_updated_at before update on public.stores
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger tickets_set_updated_at before update on public.tickets
for each row execute function public.set_updated_at();

create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select store_id from public.profiles where id = (select auth.uid()) limit 1;
$$;
revoke all on function public.current_store_id() from public;
grant execute on function public.current_store_id() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_store_id uuid;
begin
  insert into public.stores (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'store_name', ''), 'Mi tienda'))
  returning id into new_store_id;
  insert into public.profiles (id, store_id, display_name, role)
  values (new.id, new_store_id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)), 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_ownership_fields()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.store_id is distinct from old.store_id
     or (tg_table_name = 'profiles' and new.role is distinct from old.role)
     or (tg_table_name in ('tickets', 'payments') and new.created_by is distinct from old.created_by) then
    raise exception 'Los campos de pertenencia no se pueden modificar';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_ownership before update on public.profiles
for each row execute function public.protect_ownership_fields();
create trigger tickets_protect_ownership before update on public.tickets
for each row execute function public.protect_ownership_fields();
create trigger payments_protect_ownership before update on public.payments
for each row execute function public.protect_ownership_fields();

-- Índices: listados por tienda, búsquedas de cliente y movimientos cronológicos.
create index clients_store_id_idx on public.clients (store_id);
create index clients_store_name_idx on public.clients (store_id, name);
create index tickets_store_id_idx on public.tickets (store_id);
create index tickets_client_id_idx on public.tickets (client_id);
create index tickets_store_client_idx on public.tickets (store_id, client_id);
create index tickets_client_created_idx on public.tickets (client_id, created_at desc);
create index tickets_active_idx on public.tickets (store_id, client_id) where status = 'active';
create index payments_store_id_idx on public.payments (store_id);
create index payments_client_id_idx on public.payments (client_id);
create index payments_store_client_idx on public.payments (store_id, client_id);
create index payments_client_created_idx on public.payments (client_id, created_at desc);
create index profiles_store_id_idx on public.profiles (store_id);

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.tickets enable row level security;
alter table public.payments enable row level security;

create policy stores_select_own on public.stores for select to authenticated
using (id = (select public.current_store_id()));
create policy stores_update_own on public.stores for update to authenticated
using (id = (select public.current_store_id()))
with check (id = (select public.current_store_id()));

create policy profiles_select_own_store on public.profiles for select to authenticated
using (store_id = (select public.current_store_id()));
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid()) and store_id = (select public.current_store_id()))
with check (id = (select auth.uid()) and store_id = (select public.current_store_id()));

create policy clients_select_own_store on public.clients for select to authenticated
using (store_id = (select public.current_store_id()));
create policy clients_insert_own_store on public.clients for insert to authenticated
with check (store_id = (select public.current_store_id()));
create policy clients_update_own_store on public.clients for update to authenticated
using (store_id = (select public.current_store_id()))
with check (store_id = (select public.current_store_id()));

create policy tickets_select_own_store on public.tickets for select to authenticated
using (store_id = (select public.current_store_id()));
create policy tickets_insert_own_store on public.tickets for insert to authenticated
with check (store_id = (select public.current_store_id()) and created_by = (select auth.uid()));
create policy tickets_update_own_store on public.tickets for update to authenticated
using (store_id = (select public.current_store_id()))
with check (store_id = (select public.current_store_id()));

create policy payments_select_own_store on public.payments for select to authenticated
using (store_id = (select public.current_store_id()));
create policy payments_insert_own_store on public.payments for insert to authenticated
with check (store_id = (select public.current_store_id()) and created_by = (select auth.uid()));
create policy payments_update_own_store on public.payments for update to authenticated
using (store_id = (select public.current_store_id()))
with check (store_id = (select public.current_store_id()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-photos', 'ticket-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create policy ticket_photos_select_own_store on storage.objects for select to authenticated
using (bucket_id = 'ticket-photos' and (split_part(name, '/', 1))::uuid = (select public.current_store_id()));
create policy ticket_photos_insert_own_store on storage.objects for insert to authenticated
with check (bucket_id = 'ticket-photos' and (split_part(name, '/', 1))::uuid = (select public.current_store_id()));
create policy ticket_photos_update_own_store on storage.objects for update to authenticated
using (bucket_id = 'ticket-photos' and (split_part(name, '/', 1))::uuid = (select public.current_store_id()))
with check (bucket_id = 'ticket-photos' and (split_part(name, '/', 1))::uuid = (select public.current_store_id()));
create policy ticket_photos_delete_own_store on storage.objects for delete to authenticated
using (bucket_id = 'ticket-photos' and (split_part(name, '/', 1))::uuid = (select public.current_store_id()));