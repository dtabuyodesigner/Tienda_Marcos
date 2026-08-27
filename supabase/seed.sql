-- Datos ficticios de desarrollo. Ejecutar con el rol de servicio en un entorno local.
insert into public.stores (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Tienda Demo Marcos')
on conflict (id) do nothing;

insert into public.clients (id, store_id, name, phone)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Marcos', '600000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pedrito', null),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Maria', '600000003'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Antonio', null)
on conflict (id) do nothing;

-- Para movimientos, sustituir este UUID por el de un usuario Auth de desarrollo.
-- Los siguientes inserts quedan preparados para ejecutarse despues de crear ese usuario.
-- insert into public.tickets (store_id, client_id, amount_cents, concept, created_by)
-- values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 1250, 'Compra semanal', '<AUTH_USER_UUID>');
-- insert into public.payments (store_id, client_id, amount_cents, created_by)
-- values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 500, '<AUTH_USER_UUID>');