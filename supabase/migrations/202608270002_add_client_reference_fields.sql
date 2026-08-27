alter table public.clients
  add column if not exists nickname text,
  add column if not exists note text;

create index if not exists clients_store_nickname_idx on public.clients (store_id, nickname);
