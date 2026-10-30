-- Apply it only after the captain writes apply.
-- Posts remember whether the fix was GPS, a dropped pin, or the demo street.
-- A claim stores a one-time code and expires after 7 days.
-- cancel_claim deletes only the caller's own pending or in_review row.

alter table public.posts
  add column if not exists location_source text not null default 'gps';

alter table public.posts drop constraint if exists posts_location_source_check;
alter table public.posts
  add constraint posts_location_source_check
  check (location_source in ('gps', 'pin', 'demo'));

create or replace function public.stamp_post_source(p_post_id uuid, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_source is null or p_source not in ('gps', 'pin', 'demo') then
    raise exception 'bad_source';
  end if;
  update public.posts
  set location_source = p_source
  where id = p_post_id
    and author_id = auth.uid();
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.stamp_post_source(uuid, text) from public, anon;
grant execute on function public.stamp_post_source(uuid, text) to authenticated;

alter table public.shop_owners drop constraint if exists shop_owners_status_check;
alter table public.shop_owners
  add constraint shop_owners_status_check
  check (status in ('pending', 'verified', 'rejected', 'in_review'));

alter table public.shop_owners add column if not exists claim_code text;
alter table public.shop_owners add column if not exists claim_expires_at timestamptz;

create or replace function public.claim_state(p_shop_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mine text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select status, claim_expires_at into v_mine, v_expires
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid();

  if v_mine is null then
    return 'none';
  end if;

  if v_mine in ('pending', 'in_review') and v_expires is not null and v_expires < now() then
    return 'none';
  end if;

  if v_mine = 'verified' then
    return 'own';
  end if;

  if v_mine in ('pending', 'in_review', 'rejected') then
    return v_mine;
  end if;

  return 'none';
end;
$$;

revoke all on function public.claim_state(uuid) from public, anon;
grant execute on function public.claim_state(uuid) to authenticated;

create or replace function public.open_claim(p_shop_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_code is null or char_length(btrim(p_code)) < 4 or char_length(p_code) > 40 then
    raise exception 'bad_code';
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
  if exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and user_id = auth.uid()
      and status = 'verified'
  ) then
    return 'verified';
  end if;

  insert into public.shop_owners (shop_id, user_id, status, claim_code, claim_expires_at)
  values (p_shop_id, auth.uid(), 'pending', btrim(p_code), v_expires)
  on conflict (shop_id, user_id) do update
    set status = 'pending',
        claim_code = excluded.claim_code,
        claim_expires_at = excluded.claim_expires_at
    where public.shop_owners.status is distinct from 'verified';

  return 'pending';
end;
$$;

revoke all on function public.open_claim(uuid, text) from public, anon;
grant execute on function public.open_claim(uuid, text) to authenticated;

create or replace function public.mark_claim_review(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  update public.shop_owners
  set status = 'in_review'
  where shop_id = p_shop_id
    and user_id = auth.uid()
    and status in ('pending', 'in_review')
    and (claim_expires_at is null or claim_expires_at >= now());
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.mark_claim_review(uuid) from public, anon;
grant execute on function public.mark_claim_review(uuid) to authenticated;

create or replace function public.cancel_claim(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  delete from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid()
    and status in ('pending', 'in_review');
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.cancel_claim(uuid) from public, anon;
grant execute on function public.cancel_claim(uuid) to authenticated;
