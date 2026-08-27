-- Registro controlado: alta de tienda solo con invitacion.
--
-- Decision: la frontera de seguridad NO es la pantalla de registro, sino el
-- trigger que ya crea tienda y perfil al insertarse el usuario en `auth.users`.
-- Ese trigger corre dentro de la MISMA transaccion que el alta de Auth, asi que
-- si la invitacion no es valida se lanza una excepcion y el usuario no llega a
-- existir. Cualquiera puede llamar a signUp desde fuera de la aplicacion; sin
-- codigo valido no obtiene cuenta. Por eso no hay ningun codigo en el frontend
-- ni comparacion en React de la que dependa la seguridad.

create table public.store_invites (
  id uuid primary key default gen_random_uuid(),
  -- Solo el hash. El codigo en claro existe una vez, al emitirlo, y no se guarda.
  code_hash bytea not null unique,
  -- Para saber a quien se entrego, sin revelar el codigo.
  label text,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  used_at timestamptz,
  -- `set null`: poder borrar un usuario mal registrado es justo el caso que mas
  -- se va a necesitar, y la invitacion sigue marcada como usada por `used_count`.
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint store_invites_not_overused check (used_count <= max_uses)
);

-- RLS activa y deliberadamente SIN politicas: ni anonimo ni autenticado pueden
-- leer, listar ni escribir invitaciones. Solo las funciones `security definer`
-- de abajo, que son propiedad de postgres, tocan esta tabla.
alter table public.store_invites enable row level security;
revoke all on table public.store_invites from public, anon, authenticated;

-- Normaliza antes de hashear para que guiones, espacios y mayusculas que teclee
-- el usuario no cambien el resultado.
-- Fuera del rango de longitud devuelve NULL, que no casa con ningun `code_hash` y
-- ademas choca contra el `not null` al insertar. Sin esto, cualquier cadena de solo
-- signos (`---`) normalizaria a vacio y compartiria un hash fijo y conocido.
create or replace function public.invite_code_hash(code text)
returns bytea language sql immutable security invoker set search_path = ''
as $$
  select extensions.digest(normalizado, 'sha256')
  from (select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) as normalizado) as n
  where length(normalizado) between 20 and 64
$$;
revoke all on function public.invite_code_hash(text) from public, anon, authenticated;

-- Emite una invitacion y devuelve el codigo en claro UNA sola vez. Se genera en el
-- servidor con `gen_random_bytes` (80 bits) para que al EMITIRLO no viaje como
-- parametro y no acabe en el texto de la sentencia. Al usarlo si viaja en claro
-- (RPC por POST y metadata del alta), protegido por TLS.
create or replace function public.issue_store_invite(label text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  code text;
begin
  code := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  insert into public.store_invites (code_hash, label) values (public.invite_code_hash(code), label);
  return code;
end;
$$;
revoke all on function public.issue_store_invite(text) from public, anon, authenticated;

-- Solo para el mensaje de error de la pantalla de registro. Devuelve un booleano
-- y nada mas: no revela etiqueta, usos ni fechas. NO es la frontera de seguridad;
-- el consumo real y atomico ocurre en el trigger de alta.
create or replace function public.invite_is_available(code text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.store_invites
    where code_hash = public.invite_code_hash(code)
      and revoked_at is null
      and used_count < max_uses
  )
$$;
revoke all on function public.invite_is_available(text) from public;
grant execute on function public.invite_is_available(text) to anon, authenticated;

-- Alta de usuario: consume invitacion y crea tienda y perfil, todo o nada.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  new_store_id uuid;
  invite_code text;
  consumed uuid;
begin
  invite_code := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  if invite_code is null then
    raise exception 'Se necesita un codigo de invitacion para crear una cuenta';
  end if;

  -- Consumo atomico: el UPDATE bloquea la fila, asi que dos altas simultaneas
  -- con el mismo codigo se serializan y la segunda ya no encuentra usos libres.
  update public.store_invites
     set used_count = used_count + 1,
         used_at = now(),
         used_by = new.id
   where code_hash = public.invite_code_hash(invite_code)
     and revoked_at is null
     and used_count < max_uses
  returning id into consumed;

  if consumed is null then
    raise exception 'Codigo de invitacion no valido o ya usado';
  end if;

  insert into public.stores (name)
  values (coalesce(nullif(btrim(new.raw_user_meta_data ->> 'store_name'), ''), 'Mi tienda'))
  returning id into new_store_id;

  insert into public.profiles (id, store_id, display_name, role)
  values (new.id, new_store_id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 'owner');

  return new;
end;
$$;
