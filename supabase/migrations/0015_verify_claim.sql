-- Apply it only after the captain writes apply.
-- A claim stays pending until the app has checked the counter and the sign.
-- This file does not add a table. Demo owners that are already verified stay verified.

create or replace function public.claim_state(p_shop_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mine text;
begin
  if exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and user_id = auth.uid()
      and status = 'verified'
  ) then
    return 'own';
  end if;

  if exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and status = 'verified'
      and user_id is distinct from auth.uid()
  ) then
    return 'taken';
  end if;

  select status into v_mine
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid();

  if v_mine = 'pending' then
    return 'pending';
  end if;

  return 'open';
end;
$$;

create or replace function public.verify_claim(p_shop_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found';
  end if;

  if exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and status = 'verified'
      and user_id <> auth.uid()
  ) then
    raise exception 'already_owned';
  end if;

  insert into public.shop_owners (shop_id, user_id, status)
  values (p_shop_id, auth.uid(), 'verified')
  on conflict (shop_id, user_id) do update
    set status = 'verified'
    where public.shop_owners.status is distinct from 'rejected';

  select status into v_status
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid();

  return v_status;
end;
$$;

revoke all on function public.claim_state(uuid) from public, anon;
revoke all on function public.verify_claim(uuid) from public, anon;
grant execute on function public.claim_state(uuid) to anon, authenticated;
grant execute on function public.verify_claim(uuid) to authenticated;
