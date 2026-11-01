-- Book thanks. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- A verified owner gets one card per person who added live book pages,
-- not one card per page, and never a card for their own pages.
-- Give coupon writes the same coupons table as keep_post.
-- No thanks records a dismissal. Either decision hides the card.
-- reset_demo clears those demo decisions and the demo coupons (null post_id)
-- so the card can come back. Rollback: drop public.thank_book,
-- public.dismiss_book_thanks, and public.book_thanks, then restore
-- owner_inbox from 0019_posts_server_only.sql and reset_demo from
-- 0022_farm_to_go_name.sql.

create table if not exists public.book_thanks (
  shop_id uuid not null references public.shops (id) on delete cascade,
  contributor_id uuid not null references public.profiles (id) on delete cascade,
  decision text not null check (decision in ('coupon', 'dismissed')),
  decided_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  primary key (shop_id, contributor_id)
);

alter table public.book_thanks enable row level security;

revoke all on table public.book_thanks from public, anon, authenticated;

-- Inbox groups live pages by contributor. The first page is the thumbnail.
create index if not exists shop_book_pages_live_contributor_idx
  on public.shop_book_pages (shop_id, contributed_by, created_at)
  where status = 'live' and contributed_by is not null;

create or replace function public.thank_book(
  p_shop_id uuid,
  p_contributor_id uuid,
  p_offer text default null,
  p_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_day date;
  v_days integer;
  v_coupon_expires timestamptz;
  v_coupon_id uuid;
  v_repeat boolean;
  v_offer text;
  v_rows integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  if p_shop_id is null or p_contributor_id is null then
    raise exception 'not_found';
  end if;

  if not public.is_verified_owner(p_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if exists (
    select 1
    from public.shop_owners as owners
    where owners.shop_id = p_shop_id
      and owners.user_id = p_contributor_id
      and owners.status = 'verified'
  ) then
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1
    from public.shop_book_pages as pages
    where pages.shop_id = p_shop_id
      and pages.contributed_by = p_contributor_id
      and pages.status = 'live'
  ) then
    raise exception 'not_found';
  end if;

  perform 1
  from public.shop_book_pages as pages
  where pages.shop_id = p_shop_id
    and pages.contributed_by = p_contributor_id
    and pages.status = 'live'
  for update;

  insert into public.book_thanks (shop_id, contributor_id, decision, decided_by)
  values (p_shop_id, p_contributor_id, 'coupon', auth.uid())
  on conflict (shop_id, contributor_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_decided';
  end if;

  select coalesce(nullif(btrim(shops.timezone), ''), 'UTC')
    into v_tz
  from public.shops as shops
  where shops.id = p_shop_id;

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
      on demo_accounts.user_id = p_contributor_id
     and demo_accounts.role = 'explorer'
    where shops.id = p_shop_id
      and shops.is_demo
  ) into v_repeat;

  v_coupon_id := null;
  begin
    insert into public.coupons (holder_id, shop_id, post_id, day, expires_at, demo_repeat, offer)
    values (p_contributor_id, p_shop_id, null, v_day, v_coupon_expires, v_repeat, v_offer)
    on conflict (holder_id, shop_id, day) where demo_repeat = false do nothing
    returning id into strict v_coupon_id;
  exception
    when no_data_found then
      v_coupon_id := null;
  end;

  return v_coupon_id;
end;
$$;

create or replace function public.dismiss_book_thanks(
  p_shop_id uuid,
  p_contributor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  if p_shop_id is null or p_contributor_id is null then
    raise exception 'not_found';
  end if;

  if not public.is_verified_owner(p_shop_id) then
    raise exception 'not a verified owner';
  end if;

  if not exists (
    select 1
    from public.shop_book_pages as pages
    where pages.shop_id = p_shop_id
      and pages.contributed_by = p_contributor_id
      and pages.status = 'live'
      and not exists (
        select 1
        from public.shop_owners as owners
        where owners.shop_id = pages.shop_id
          and owners.user_id = pages.contributed_by
          and owners.status = 'verified'
      )
  ) then
    raise exception 'not_found';
  end if;

  insert into public.book_thanks (shop_id, contributor_id, decision, decided_by)
  values (p_shop_id, p_contributor_id, 'dismissed', auth.uid())
  on conflict (shop_id, contributor_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_decided';
  end if;
end;
$$;

revoke all on function public.thank_book(uuid, uuid, text, integer) from public, anon;
grant execute on function public.thank_book(uuid, uuid, text, integer) to authenticated;

revoke all on function public.dismiss_book_thanks(uuid, uuid) from public, anon;
grant execute on function public.dismiss_book_thanks(uuid, uuid) to authenticated;

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
          coalesce(p.ready_at, p.expires_at) as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and p.is_seed = false
          and p.status = 'live'
          and coalesce(p.ready_at, p.expires_at) <= now()
          and coalesce(p.ready_at, p.expires_at) + interval '7 days' > now()
        order by p.created_at desc
      ) as card
    ), '[]'::jsonb),
    'bookThanks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'shopId', grouped.shop_id,
        'contributorId', grouped.contributor_id,
        'shopName', grouped.shop_name,
        'authorName', grouped.author_name,
        'pageCount', grouped.page_count,
        'photoPath', grouped.photo_path
      ) order by grouped.page_count desc, grouped.shop_id)
      from (
        select
          pages.shop_id,
          pages.contributed_by as contributor_id,
          min(shops.name) as shop_name,
          split_part(coalesce(min(profiles.display_name), ''), ' ', 1) as author_name,
          count(*)::integer as page_count,
          (
            select earliest.image_path
            from public.shop_book_pages as earliest
            where earliest.shop_id = pages.shop_id
              and earliest.contributed_by = pages.contributed_by
              and earliest.status = 'live'
            order by earliest.created_at asc, earliest.id asc
            limit 1
          ) as photo_path
        from public.shop_book_pages as pages
        join public.shops as shops on shops.id = pages.shop_id
        left join public.profiles as profiles on profiles.id = pages.contributed_by
        where public.is_verified_owner(pages.shop_id)
          and pages.status = 'live'
          and pages.contributed_by is not null
          and not exists (
            select 1
            from public.shop_owners as owners
            where owners.shop_id = pages.shop_id
              and owners.user_id = pages.contributed_by
              and owners.status = 'verified'
          )
          and not exists (
            select 1
            from public.book_thanks as thanks
            where thanks.shop_id = pages.shop_id
              and thanks.contributor_id = pages.contributed_by
          )
        group by pages.shop_id, pages.contributed_by
      ) as grouped
    ), '[]'::jsonb),
    'liveNow', coalesce((
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
          coalesce(p.ready_at, p.expires_at) as "expiresAt"
        from public.posts as p
        join public.shops as s on s.id = p.shop_id
        left join public.profiles as pr on pr.id = p.author_id
        where public.is_verified_owner(p.shop_id)
          and s.is_demo
          and p.is_seed = false
          and p.status = 'live'
          and coalesce(p.ready_at, p.expires_at) > now()
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

revoke all on function public.owner_inbox() from public, anon;
grant execute on function public.owner_inbox() to authenticated;

-- Replaces reset_demo from 0022. Demo book-thanks decisions are cleared.
-- Coupons for those cards use a null post_id and already match the coupon delete.
create or replace function public.reset_demo()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_paths text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.demo_accounts where user_id = auth.uid()
  ) then
    raise exception 'not_demo';
  end if;

  select coalesce(array_agg(posts.photo_path), array[]::text[]) into v_paths
  from public.posts as posts
  join public.shops as shops on shops.id = posts.shop_id
  where shops.is_demo = true
    and posts.is_demo = false
    and posts.photo_path is not null
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  delete from public.place_facts as facts
  using public.posts as posts
  join public.shops as shops on shops.id = posts.shop_id
  where facts.post_id = posts.id
    and shops.is_demo = true
    and posts.is_demo = false
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  delete from public.coupons as coupons
  using public.shops as shops
  where coupons.shop_id = shops.id
    and shops.is_demo = true
    and coupons.holder_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts)
    and (
      coupons.post_id is null
      or coupons.post_id not in (select id from public.posts where is_demo)
    );

  delete from public.book_thanks as thanks
  using public.shops as shops
  where thanks.shop_id = shops.id
    and shops.is_demo = true
    and thanks.contributor_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  -- Inbox cards are these posts. text_translated leaves with the row.
  delete from public.posts as posts
  using public.shops as shops
  where posts.shop_id = shops.id
    and shops.is_demo = true
    and posts.is_demo = false
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  update public.shops as shops
  set name = seed.name
  from (
    values
      ('mala-mafia', 'Farm to Go (demo)'),
      ('coconut-shake-stand', 'Coconut shake stand'),
      ('krua-mae-yen', 'Krua Mae Yen'),
      ('pak-kapi', 'Pak Kapi'),
      ('thuk-jai-chieo', 'Thuk Jai Chieo'),
      ('clean-together', 'Clean Together'),
      ('baan-air', 'Baan Air'),
      ('beegee-barber', 'BEEGEE Barber')
  ) as seed(slug, name)
  where shops.slug = seed.slug
    and shops.is_demo = true;

  -- Café A and café B. Seeded SVG pages, and pages a demo account added
  -- who is not the verified owner, go away. Owner pages and real-user pages stay.
  delete from public.shop_book_writes as writes
  using public.shop_book_pages as pages, public.shops as shops
  where writes.page_id = pages.id
    and pages.shop_id = shops.id
    and shops.is_demo = true
    and shops.slug in ('mala-mafia', 'coconut-shake-stand')
    and (
      (shops.slug = 'mala-mafia' and pages.image_path like '/demo/mala-mafia-%')
      or (
        pages.contributed_by in (select demo_accounts.user_id from public.demo_accounts as demo_accounts)
        and not exists (
          select 1
          from public.shop_owners as owners
          where owners.shop_id = shops.id
            and owners.user_id = pages.contributed_by
            and owners.status = 'verified'
        )
      )
    );

  delete from public.shop_book_pages as pages
  using public.shops as shops
  where pages.shop_id = shops.id
    and shops.is_demo = true
    and shops.slug in ('mala-mafia', 'coconut-shake-stand')
    and (
      (shops.slug = 'mala-mafia' and pages.image_path like '/demo/mala-mafia-%')
      or (
        pages.contributed_by in (select demo_accounts.user_id from public.demo_accounts as demo_accounts)
        and not exists (
          select 1
          from public.shop_owners as owners
          where owners.shop_id = shops.id
            and owners.user_id = pages.contributed_by
            and owners.status = 'verified'
        )
      )
    );

  update public.shop_books as books
  set tagline = 'Smoothies, coffee, and brunch'
  from public.shops as shops
  where books.shop_id = shops.id
    and shops.is_demo = true
    and shops.slug = 'mala-mafia';

  select demo_accounts.user_id into v_owner
  from public.demo_accounts as demo_accounts
  where demo_accounts.role = 'owner'
  limit 1;

  if v_owner is not null then
    update public.shop_owners as owners
    set status = 'verified'
    from public.shops as shops
    where owners.shop_id = shops.id
      and owners.user_id = v_owner
      and shops.is_demo = true
      and shops.slug in (
        'mala-mafia',
        'coconut-shake-stand',
        'krua-mae-yen',
        'pak-kapi',
        'thuk-jai-chieo',
        'clean-together',
        'baan-air',
        'beegee-barber'
      )
      and not exists (
        select 1
        from public.shop_owners as real_owner
        where real_owner.shop_id = shops.id
          and real_owner.status = 'verified'
          and real_owner.user_id <> v_owner
      );

    insert into public.shop_owners (shop_id, user_id, status)
    select shops.id, v_owner, 'verified'
    from public.shops as shops
    where shops.is_demo = true
      and shops.slug in (
        'mala-mafia',
        'coconut-shake-stand',
        'krua-mae-yen',
        'pak-kapi',
        'thuk-jai-chieo',
        'clean-together',
        'baan-air',
        'beegee-barber'
      )
      and not exists (
        select 1
        from public.shop_owners as existing
        where existing.shop_id = shops.id
          and existing.user_id = v_owner
      )
      and not exists (
        select 1
        from public.shop_owners as real_owner
        where real_owner.shop_id = shops.id
          and real_owner.status = 'verified'
          and real_owner.user_id <> v_owner
      );
  end if;

  return coalesce(v_paths, array[]::text[]);
end;
$$;

revoke all on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;
