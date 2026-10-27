-- Loop v1. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- keep_post treats a missing or invalid shop time zone as UTC.
-- Pass deletes the blurred photo, then marks the post passed.
-- place_facts keeps anonymous prices and busy times, never captions.

alter table public.coupons
  add column if not exists redeemed_by uuid references auth.users (id) on delete set null;

create table if not exists public.place_facts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  observed_at timestamptz not null default now(),
  facts jsonb not null,
  post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint place_facts_object_check
    check (jsonb_typeof(facts) = 'object' and pg_column_size(facts) <= 4096)
);

alter table public.place_facts enable row level security;

drop policy if exists place_facts_select_public on public.place_facts;
create policy place_facts_select_public
  on public.place_facts
  for select
  to anon, authenticated
  using (true);

revoke all on table public.place_facts from public, anon, authenticated;
grant select on table public.place_facts to anon, authenticated;

create index if not exists place_facts_shop_observed_idx
  on public.place_facts (shop_id, observed_at desc);

create or replace function public.anonymous_place_facts(p_facts jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if p_facts is null or jsonb_typeof(p_facts) <> 'object' then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', item->>'name',
    'price', case
      when (item->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then to_jsonb((item->>'price')::numeric)
      else 'null'::jsonb
    end,
    'currency', case
      when coalesce(item->>'currency', '') ~ '^[A-Z]{3}$' then to_jsonb(item->>'currency')
      else 'null'::jsonb
    end
  )), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(
    case when jsonb_typeof(p_facts->'items') = 'array' then p_facts->'items' else '[]'::jsonb end
  ) as item
  where btrim(coalesce(item->>'name', '')) <> '';

  return jsonb_strip_nulls(jsonb_build_object(
    'items', v_items,
    'crowd', p_facts->'crowd',
    'open_status', coalesce(p_facts->'open_status', p_facts->'openStatus'),
    'signals', case
      when jsonb_typeof(p_facts->'signals') = 'array' then p_facts->'signals'
      else '[]'::jsonb
    end,
    'sign_language', coalesce(p_facts->'sign_language', p_facts->'signLanguage')
  )) - 'caption' - 'captions';
end;
$$;

revoke all on function public.anonymous_place_facts(jsonb) from public, anon, authenticated;

create or replace function public.keep_post(p_post_id uuid)
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
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
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
    v_coupon_expires := ((v_day + 1)::timestamp at time zone v_tz);
  exception
    when others then
      v_tz := 'UTC';
      v_day := (now() at time zone 'UTC')::date;
      v_coupon_expires := ((v_day + 1)::timestamp at time zone 'UTC');
  end;

  v_coupon_id := null;
  begin
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at)
    values (v_author_id, v_shop_id, p_post_id, v_day, v_coupon_expires)
    on conflict (holder_id, shop_id, day) do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

create or replace function public.pass_post_begin(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_photo_path text;
begin
  select posts.shop_id, posts.status, posts.expires_at, posts.photo_path
    into v_shop_id, v_status, v_expires_at, v_photo_path
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
    raise exception 'post is not ready to pass';
  end if;

  return v_photo_path;
end;
$$;

create or replace function public.pass_post_finish(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_photo_path text;
begin
  select posts.shop_id, posts.status, posts.expires_at, posts.photo_path
    into v_shop_id, v_status, v_expires_at, v_photo_path
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
    raise exception 'post is not ready to pass';
  end if;

  if v_photo_path is not null and exists (
    select 1
    from storage.objects
    where bucket_id = 'post-photos'
      and name = v_photo_path
  ) then
    raise exception 'photo_still_stored';
  end if;

  update public.posts
  set status = 'passed',
      decided_at = now(),
      decided_by = auth.uid(),
      photo_path = null,
      text_original = null,
      text_translated = '{}'::jsonb,
      facts = null
  where id = p_post_id;

  update public.place_facts
  set post_id = null
  where post_id = p_post_id;
end;
$$;

revoke all on function public.pass_post(uuid) from public, anon, authenticated;

drop policy if exists post_photos_delete_owner on storage.objects;
create policy post_photos_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-photos'
    and exists (
      select 1
      from public.posts as p
      where p.photo_path = name
        and public.is_verified_owner(p.shop_id)
    )
  );

create or replace function public.redeem_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_shop uuid;
  v_status text;
  v_expires timestamptz;
  v_holder uuid;
  v_name text;
  v_recent integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select id, shop_id, status, expires_at, holder_id
    into v_id, v_shop, v_status, v_expires, v_holder
  from public.coupons
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if not public.is_verified_owner(v_shop) then
    raise exception 'not_owner';
  end if;

  if v_status = 'used' then
    raise exception 'already_used';
  end if;

  if v_status <> 'active' or v_expires <= now() then
    raise exception 'expired';
  end if;

  select count(*) into v_recent
  from public.coupons
  where redeemed_by = auth.uid()
    and used_at > now() - interval '1 hour';

  if v_recent >= 60 then
    raise exception 'rate_limited';
  end if;

  update public.coupons
  set status = 'used',
      used_at = now(),
      redeemed_by = auth.uid()
  where id = v_id;

  select split_part(coalesce(display_name, ''), ' ', 1)
    into v_name
  from public.profiles
  where id = v_holder;

  return jsonb_build_object(
    'ok', true,
    'shop_id', v_shop,
    'holder_name', coalesce(v_name, ''),
    'expires_at', v_expires
  );
end;
$$;

create or replace function public.claim_shop(p_shop_id uuid)
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

  insert into public.shop_owners (shop_id, user_id, status)
  values (p_shop_id, auth.uid(), 'pending')
  on conflict (shop_id, user_id) do nothing;

  select status into v_status
  from public.shop_owners
  where shop_id = p_shop_id
    and user_id = auth.uid();

  return v_status;
end;
$$;

create or replace function public.owner_inbox()
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

  return jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(to_jsonb(card))
      from (
        select
          p.id,
          p.shop_id as "shopId",
          s.name as "shopName",
          s.slug as "shopSlug",
          p.photo_path as "photoPath",
          p.facts,
          split_part(coalesce(pr.display_name, ''), ' ', 1) as "authorName",
          p.expires_at as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and p.status = 'live'
          and p.expires_at <= now()
          and p.expires_at + interval '7 days' > now()
        order by p.created_at desc
      ) as card
    ), '[]'::jsonb),
    'keptToday', (
      select count(*)
      from public.posts as p
      where public.is_verified_owner(p.shop_id)
        and p.status = 'kept'
        and p.decided_at > now() - interval '24 hours'
    ),
    'passedToday', (
      select count(*)
      from public.posts as p
      where public.is_verified_owner(p.shop_id)
        and p.status = 'passed'
        and p.decided_at > now() - interval '24 hours'
    )
  );
end;
$$;

create or replace function public.expired_undecided()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.posts as p
  where public.is_verified_owner(p.shop_id)
    and p.status = 'live'
    and p.expires_at + interval '7 days' <= now();
$$;

create or replace function public.owner_home()
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
      'shopId', s.id,
      'name', s.name,
      'slug', s.slug,
      'status', o.status
    ) order by s.name)
    from public.shop_owners as o
    join public.shops as s on s.id = o.shop_id
    where o.user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

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
      'shopSlug', s.slug
    ) order by
      case when c.status = 'active' and c.expires_at > now() then 0 else 1 end,
      c.expires_at)
    from public.coupons as c
    join public.shops as s on s.id = c.shop_id
    where c.holder_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.shop_public(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop public.shops%rowtype;
begin
  select * into v_shop from public.shops where slug = p_slug;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_shop.id,
    'name', v_shop.name,
    'nameLocal', v_shop.name_local,
    'slug', v_shop.slug,
    'kept', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'photoPath', p.photo_path,
        'author', split_part(coalesce(pr.display_name, ''), ' ', 1),
        'facts', p.facts
      ) order by p.decided_at desc nulls last)
      from public.posts as p
      left join public.profiles as pr on pr.id = p.author_id
      where p.shop_id = v_shop.id
        and p.status = 'kept'
    ), '[]'::jsonb),
    'live', (
      select jsonb_build_object('id', p.id, 'expiresAt', p.expires_at)
      from public.posts as p
      where p.shop_id = v_shop.id
        and p.status = 'live'
        and p.expires_at > now()
      order by p.expires_at desc
      limit 1
    )
  );
end;
$$;

create or replace function public.create_post(
  p_shop_id uuid,
  p_photo_path text,
  p_text_original text,
  p_text_translated jsonb,
  p_facts jsonb default null
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_text text;
  v_keys integer;
  v_post public.posts;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found';
  end if;

  if p_photo_path is null
     or position(v_uid::text || '/' in p_photo_path) <> 1
     or p_photo_path like '%..%' then
    raise exception 'bad_photo_path';
  end if;

  v_text := btrim(coalesce(p_text_original, ''));
  if char_length(v_text) > 400 then
    raise exception 'bad_text';
  end if;

  if p_text_translated is null or jsonb_typeof(p_text_translated) <> 'object' then
    raise exception 'bad_text';
  end if;

  select count(*) into v_keys from jsonb_object_keys(p_text_translated);
  if v_keys > 6 then
    raise exception 'bad_text';
  end if;

  if p_facts is not null and (jsonb_typeof(p_facts) <> 'object' or pg_column_size(p_facts) > 4096) then
    raise exception 'bad_facts';
  end if;

  if (
    select count(*)
    from public.posts
    where author_id = v_uid
      and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'rate_limited';
  end if;

  if exists (
    select 1
    from public.posts
    where author_id = v_uid
      and shop_id = p_shop_id
      and status = 'live'
      and expires_at > now()
  ) then
    raise exception 'already_live';
  end if;

  insert into public.posts (
    shop_id, author_id, photo_path, text_original, text_translated, facts, status, is_demo
  )
  values (
    p_shop_id, v_uid, p_photo_path, nullif(v_text, ''), p_text_translated, p_facts, 'live', false
  )
  returning * into v_post;

  if p_facts is not null then
    insert into public.place_facts (shop_id, facts, post_id)
    values (p_shop_id, public.anonymous_place_facts(p_facts), v_post.id);
  end if;

  return v_post;
end;
$$;

create or replace function public.delete_own_post(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_author uuid;
  v_path text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  select author_id, photo_path into v_author, v_path
  from public.posts
  where id = p_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_author is distinct from v_uid then
    raise exception 'not_author';
  end if;

  delete from public.place_facts where post_id = p_id;
  delete from public.posts where id = p_id;
  return v_path;
end;
$$;

revoke all on function public.keep_post(uuid) from public, anon;
revoke all on function public.pass_post_begin(uuid) from public, anon;
revoke all on function public.pass_post_finish(uuid) from public, anon;
revoke all on function public.redeem_coupon(text) from public, anon;
revoke all on function public.claim_shop(uuid) from public, anon;
revoke all on function public.owner_inbox() from public, anon;
revoke all on function public.expired_undecided() from public, anon;
revoke all on function public.owner_home() from public, anon;
revoke all on function public.my_coupons() from public, anon;
revoke all on function public.shop_public(text) from public;

grant execute on function public.keep_post(uuid) to authenticated;
grant execute on function public.pass_post_begin(uuid) to authenticated;
grant execute on function public.pass_post_finish(uuid) to authenticated;
grant execute on function public.redeem_coupon(text) to authenticated;
grant execute on function public.claim_shop(uuid) to authenticated;
grant execute on function public.owner_inbox() to authenticated;
grant execute on function public.expired_undecided() to authenticated;
grant execute on function public.owner_home() to authenticated;
grant execute on function public.my_coupons() to authenticated;
grant execute on function public.shop_public(text) to anon, authenticated;
grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.delete_own_post(uuid) to authenticated;
