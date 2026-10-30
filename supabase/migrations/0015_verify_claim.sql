-- Apply it only after the captain writes apply.
-- verify_claim runs only as service_role, after the server has checked the
-- distance and the sign photo. It verifies p_user_id, not the SQL caller.
-- claim_state tells a signed-in person their own row only.
-- One shop can have only one verified owner. Demo rows that are already
-- verified stay verified.

drop function if exists public.verify_claim(uuid);

create unique index if not exists shop_owners_one_verified
  on public.shop_owners (shop_id)
  where status = 'verified';

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
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select status into v_mine
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid();

  if v_mine = 'verified' then
    return 'own';
  end if;

  if v_mine in ('pending', 'in_review', 'rejected') then
    return v_mine;
  end if;

  return 'none';
end;
$$;

create or replace function public.verify_claim(p_shop_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_user_id is null then
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
      and user_id <> p_user_id
  ) then
    raise exception 'already_owned';
  end if;

  insert into public.shop_owners (shop_id, user_id, status)
  values (p_shop_id, p_user_id, 'verified')
  on conflict (shop_id, user_id) do update
    set status = 'verified'
    where public.shop_owners.status is distinct from 'rejected';

  update public.shops
  set claimed = true
  where id = p_shop_id;

  select status into v_status
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = p_user_id;

  return v_status;
end;
$$;

revoke all on function public.claim_state(uuid) from public, anon;
grant execute on function public.claim_state(uuid) to authenticated;

revoke all on function public.verify_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_claim(uuid, uuid) to service_role;
