-- Coupon offer and duration. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- keep_post stores an optional offer and expires the coupon after 1, 7, or 30 days.
-- One coupon per person per shop per local day still applies, except demo explorers.

alter table public.coupons
  add column if not exists offer text;

alter table public.coupons drop constraint if exists coupons_offer_len;

alter table public.coupons
  add constraint coupons_offer_len check (offer is null or char_length(offer) <= 120);

drop function if exists public.keep_post(uuid);

create or replace function public.keep_post(
  p_post_id uuid,
  p_offer text default null,
  p_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_author_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_tz text;
  v_day date;
  v_days integer;
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
  v_repeat boolean;
  v_offer text;
begin
  select posts.shop_id, posts.author_id, posts.status, posts.expires_at
    into v_shop_id, v_author_id, v_status, v_expires_at
  from public.posts as posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'post not found';
  end if;

  if not public.is_verified_owner(v_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if v_status <> 'live' or now() < v_expires_at then
    raise exception 'post is not ready to keep';
  end if;

  update public.posts
  set status = 'kept',
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_post_id;

  select coalesce(nullif(btrim(shops.timezone), ''), 'UTC')
    into v_tz
  from public.shops as shops
  where shops.id = v_shop_id;

  begin
    v_day := (now() at time zone v_tz)::date;
  exception
    when others then
      v_tz := 'UTC';
      v_day := (now() at time zone 'UTC')::date;
  end;

  v_days := case when p_days in (1, 7, 30) then p_days else 7 end;
  v_coupon_expires := now() + make_interval(days => v_days);
  v_offer := nullif(left(btrim(coalesce(p_offer, '')), 120), '');

  select exists (
    select 1
    from public.shops as shops
    join public.demo_accounts as demo_accounts
      on demo_accounts.user_id = v_author_id
     and demo_accounts.role = 'explorer'
    where shops.id = v_shop_id
      and shops.is_demo
  ) into v_repeat;

  v_coupon_id := null;
  begin
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at, demo_repeat, offer)
    values (v_author_id, v_shop_id, p_post_id, v_day, v_coupon_expires, v_repeat, v_offer)
    on conflict (holder_id, shop_id, day) where demo_repeat = false do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

revoke all on function public.keep_post(uuid, text, integer) from public, anon;
grant execute on function public.keep_post(uuid, text, integer) to authenticated;

create or replace function public.my_coupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'code', c.code,
      'status', c.status,
      'expiresAt', c.expires_at,
      'shopName', s.name,
      'shopSlug', s.slug,
      'offer', c.offer
    ) order by
      case when c.status = 'active' and c.expires_at > now() then 0 else 1 end,
      c.expires_at)
    from public.coupons as c
    join public.shops as s on s.id = c.shop_id
    where c.holder_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;
