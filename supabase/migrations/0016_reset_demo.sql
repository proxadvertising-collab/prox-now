-- Apply it only after the captain writes apply.
-- reset_demo returns photo paths for posts the two demo accounts added at
-- is_demo shops. It does not delete scripted seed posts (posts.is_demo).
-- The route deletes those paths with the Storage API. This function does not
-- write storage.objects. It does not touch real users, real shops, profiles,
-- or auth.users. A caller who is not in demo_accounts is rejected.
-- The demo owner is restored only on the seeded demo shops, and never where
-- a real verified owner exists. Seeded shop names are put back.
-- set_shop_name: a verified owner is the only person who can rename. The
-- creator loses that right once a verified owner exists. A demo account
-- cannot rename a demo shop. The slug stays.

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
      ('mala-mafia', 'Mala Mafia'),
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

create or replace function public.set_shop_name(p_shop_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_creator uuid;
  v_demo boolean;
  v_verified uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'bad_name';
  end if;

  select shops.created_by, shops.is_demo into v_creator, v_demo
  from public.shops as shops
  where shops.id = p_shop_id;

  if not found then
    raise exception 'shop_not_found';
  end if;

  if v_demo is true and exists (
    select 1 from public.demo_accounts where user_id = auth.uid()
  ) then
    raise exception 'not_allowed';
  end if;

  select shop_owners.user_id into v_verified
  from public.shop_owners as shop_owners
  where shop_owners.shop_id = p_shop_id
    and shop_owners.status = 'verified'
  limit 1;

  if v_verified is not null then
    if v_verified is distinct from auth.uid() then
      raise exception 'not_allowed';
    end if;
  elsif v_creator is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  update public.shops
  set name = v_name
  where id = p_shop_id;

  return v_name;
end;
$$;

revoke all on function public.set_shop_name(uuid, text) from public, anon;
grant execute on function public.set_shop_name(uuid, text) to authenticated;
