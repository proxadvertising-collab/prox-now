-- Apply it only after the captain writes apply.
-- reset_demo deletes posts, coupons, and sign photos made by the two demo
-- accounts at is_demo shops. It does not touch real users, real shops,
-- profiles, or auth.users. A caller who is not in demo_accounts is rejected.
-- set_shop_name lets the creator or a verified owner rename a shop. The slug stays.

create or replace function public.reset_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.demo_accounts where user_id = auth.uid()
  ) then
    raise exception 'not_demo';
  end if;

  delete from storage.objects as objects
  using public.posts as posts
  join public.shops as shops on shops.id = posts.shop_id
  where objects.bucket_id = 'post-photos'
    and posts.photo_path is not null
    and objects.name = posts.photo_path
    and shops.is_demo = true
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  delete from public.place_facts as facts
  using public.posts as posts
  join public.shops as shops on shops.id = posts.shop_id
  where facts.post_id = posts.id
    and shops.is_demo = true
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  delete from public.coupons as coupons
  using public.shops as shops
  where coupons.shop_id = shops.id
    and shops.is_demo = true
    and coupons.holder_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  -- Inbox cards are these posts. text_translated leaves with the row.
  delete from public.posts as posts
  using public.shops as shops
  where posts.shop_id = shops.id
    and shops.is_demo = true
    and posts.author_id in (select demo_accounts.user_id from public.demo_accounts as demo_accounts);

  select demo_accounts.user_id into v_owner
  from public.demo_accounts as demo_accounts
  where demo_accounts.role = 'owner'
  limit 1;

  if v_owner is not null then
    insert into public.shop_owners (shop_id, user_id, status)
    select shops.id, v_owner, 'verified'
    from public.shops as shops
    where shops.is_demo = true
      and not exists (
        select 1
        from public.shop_owners as existing
        where existing.shop_id = shops.id
          and existing.user_id = v_owner
      );
  end if;
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
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'bad_name';
  end if;

  select shops.created_by into v_creator
  from public.shops as shops
  where shops.id = p_shop_id;

  if not found then
    raise exception 'shop_not_found';
  end if;

  if v_creator is distinct from auth.uid() and not exists (
    select 1
    from public.shop_owners
    where shop_id = p_shop_id
      and user_id = auth.uid()
      and status = 'verified'
  ) then
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
