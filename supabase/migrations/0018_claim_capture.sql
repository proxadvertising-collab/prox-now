-- Claim capture tokens. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- A paper-code photo is accepted only with a token this server issued
-- when the camera opened. The token is single-use.
-- Rollback: drop function if exists public.consume_claim_capture(uuid, uuid, uuid);
-- drop function if exists public.issue_claim_capture(uuid, uuid);
-- drop table if exists public.claim_captures;

create table if not exists public.claim_captures (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  shop_id uuid not null references public.shops (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.claim_captures enable row level security;

revoke all on table public.claim_captures from public, anon, authenticated;

create index if not exists claim_captures_user_shop_idx
  on public.claim_captures (user_id, shop_id);

create or replace function public.issue_claim_capture(p_shop_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'server_only';
  end if;
  if p_shop_id is null or p_user_id is null then
    raise exception 'bad_capture';
  end if;
  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'not_found';
  end if;
  insert into public.claim_captures (token, user_id, shop_id, expires_at)
  values (v_token, p_user_id, p_shop_id, pg_catalog.now() + interval '2 minutes');
  return v_token;
end;
$$;

create or replace function public.consume_claim_capture(p_token uuid, p_shop_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'server_only';
  end if;
  update public.claim_captures
  set used_at = pg_catalog.now()
  where token = p_token
    and shop_id = p_shop_id
    and user_id = p_user_id
    and used_at is null
    and expires_at > pg_catalog.now();
  return found;
end;
$$;

revoke all on function public.issue_claim_capture(uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_claim_capture(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_claim_capture(uuid, uuid) to service_role;
grant execute on function public.consume_claim_capture(uuid, uuid, uuid) to service_role;
