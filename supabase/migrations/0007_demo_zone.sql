-- Demo zone. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- is_demo shops are the judge map. The centroid is demo_zone().
-- With no demo shops, the point is Soi 102 at zoom 16.5.
-- is_seed posts stay live until 12 Nov 2026 and never enter the keep/pass inbox.

alter table public.shops
  add column if not exists is_demo boolean not null default false;

alter table public.posts
  add column if not exists is_seed boolean not null default false;

alter table public.posts drop constraint if exists posts_expires_at_matches_created_at;

alter table public.posts
  add constraint posts_expires_at_matches_created_at
  check (
    (is_seed and expires_at = timestamptz '2026-11-12 00:00+00')
    or (not is_seed and expires_at <= created_at + interval '2 hours')
  );

create or replace function public.posts_set_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
  end if;
  if new.is_seed then
    new.expires_at := timestamptz '2026-11-12 00:00+00';
  elsif tg_op = 'INSERT' then
    new.expires_at := new.created_at + interval '2 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_set_expiry on public.posts;
create trigger posts_set_expiry
  before insert or update of is_seed on public.posts
  for each row
  execute function public.posts_set_expiry();

create or replace function public.demo_zone()
returns table (lat double precision, lng double precision, zoom double precision)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(avg(shops.lat), 12.5684)::double precision as lat,
    coalesce(avg(shops.lng), 99.9577)::double precision as lng,
    16.5::double precision as zoom
  from public.shops
  where shops.is_demo;
$$;

revoke all on function public.demo_zone() from public;
grant execute on function public.demo_zone() to public, anon, authenticated;

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
          and p.is_seed = false
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
        and p.is_seed = false
        and p.status = 'kept'
        and p.decided_at > now() - interval '24 hours'
    ),
    'passedToday', (
      select count(*)
      from public.posts as p
      where public.is_verified_owner(p.shop_id)
        and p.is_seed = false
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
    and p.is_seed = false
    and p.status = 'live'
    and p.expires_at + interval '7 days' <= now();
$$;
