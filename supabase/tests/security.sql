begin;
select plan(13);
create temp table test_state (ticket_id uuid);

-- El runner de Supabase proporciona estos helpers en un proyecto local.
select tests.create_supabase_user('a@example.test');
select tests.create_supabase_user('b@example.test');
select tests.authenticate_as('a@example.test');
insert into public.stores (id, name) values ('00000000-0000-0000-0000-00000000000a', 'Tienda A'), ('00000000-0000-0000-0000-00000000000b', 'Tienda B');
insert into public.profiles (id, store_id, display_name, role)
select auth.uid(), '00000000-0000-0000-0000-00000000000a', 'Usuario A', 'owner';
insert into public.clients (store_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Marcos'), ('00000000-0000-0000-0000-00000000000b', 'Pedrito');

select is((select count(*)::int from public.clients), 1, 'A solo lee clientes de A');
select throws_ok($$insert into public.tickets(store_id, client_id, amount_cents, created_by) values ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), 100, auth.uid())$$, null, null, 'A no crea tickets de B');
select throws_ok($$insert into public.tickets(store_id, client_id, amount_cents, created_by) values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Pedrito'), 100, auth.uid())$$, null, null, 'No cruza cliente de B');
select throws_ok($$insert into public.tickets(store_id, client_id, amount_cents, created_by) values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 0, auth.uid())$$, null, null, 'Rechaza importe invalido');
select tests.clear_authentication();
select is((select count(*)::int from public.clients), 0, 'Anonimo no lee negocio');
select tests.authenticate_as('a@example.test');
select is((select count(*)::int from storage.objects where bucket_id = 'ticket-photos' and name like '00000000-0000-0000-0000-00000000000b/%'), 0, 'A no lee fotos de B');
with new_ticket as (
	insert into public.tickets(store_id, client_id, amount_cents, created_by)
	values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 100, auth.uid())
	returning id
)
insert into test_state select id from new_ticket;
update public.tickets
set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = 'Prueba'
where id = (select ticket_id from test_state);
select isnt((select voided_at from public.tickets where id = (select ticket_id from test_state)), null, 'Anulacion conserva fecha');
select isnt((select voided_by from public.tickets where id = (select ticket_id from test_state)), null, 'Anulacion conserva autor');

-- Saldo anterior: origen explicito, unicidad, inmutabilidad y anulacion.
select throws_ok($$insert into public.tickets(store_id, client_id, amount_cents, photo_path, created_by, origin) values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 8640, '00000000-0000-0000-0000-00000000000a/x/y.jpg', auth.uid(), 'opening_balance')$$, null, null, 'El saldo anterior no admite foto de ticket');

insert into public.tickets(store_id, client_id, amount_cents, concept, created_by, origin)
values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 8640, 'Tickets de papel', auth.uid(), 'opening_balance');

select is((select amount_cents from public.tickets where origin = 'opening_balance' and status = 'active'), 8640::bigint, 'El saldo anterior guarda el importe en centimos');
select throws_ok($$insert into public.tickets(store_id, client_id, amount_cents, created_by, origin) values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 500, auth.uid(), 'opening_balance')$$, null, null, 'No permite dos saldos anteriores vivos del mismo cliente');
select throws_ok($$update public.tickets set origin = 'purchase' where origin = 'opening_balance'$$, null, null, 'El origen del movimiento no se puede reescribir');

update public.tickets set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = 'Importe equivocado'
where origin = 'opening_balance' and status = 'active';
select lives_ok($$insert into public.tickets(store_id, client_id, amount_cents, created_by, origin) values ('00000000-0000-0000-0000-00000000000a', (select id from public.clients where name = 'Marcos'), 9840, auth.uid(), 'opening_balance')$$, 'Tras anular se puede registrar el saldo anterior corregido');

select * from finish();
rollback;