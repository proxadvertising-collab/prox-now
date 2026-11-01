-- Checks for 0023. This file is not applied. Do not run it on a live database
-- from the app. Run it only in a local database where 0023 is already applied.
-- The transaction rolls back.

begin;

do $$
declare
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_explorer uuid := '22222222-2222-4222-8222-222222222222';
  v_stranger uuid := '33333333-3333-4333-8333-333333333333';
  v_shop uuid;
  v_inbox jsonb;
  v_cards jsonb;
  v_count integer;
  v_coupon uuid;
  v_repeat boolean;
begin
  insert into auth.users (id) values (v_owner), (v_explorer), (v_stranger);
  update public.profiles set display_name = 'Owner Two' where id = v_owner;
  update public.profiles set display_name = 'Judge One' where id = v_explorer;
  update public.profiles set display_name = 'Real Pat' where id = v_stranger;

  insert into public.demo_accounts (user_id, role) values
    (v_owner, 'owner'),
    (v_explorer, 'explorer');

  insert into public.shops (slug, name, category, lat, lng, is_demo)
  values ('mala-mafia', 'Farm to Go (demo)', 'drinks', 12.57, 99.96, true)
  returning id into v_shop;

  insert into public.shop_owners (shop_id, user_id, status)
  values (v_shop, v_owner, 'verified');

  insert into public.shop_book_pages (shop_id, kind, image_path, contributed_by, created_at)
  values
    (v_shop, 'menu', 'books/explorer-first.jpg', v_explorer, now() - interval '2 minutes'),
    (v_shop, 'menu', 'books/explorer-second.jpg', v_explorer, now() - interval '1 minute'),
    (v_shop, 'storefront', 'books/owner-page.jpg', v_owner, now()),
    (v_shop, 'other', 'books/real-page.jpg', v_stranger, now());

  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  v_inbox := public.owner_inbox();
  v_cards := v_inbox->'bookThanks';
  if jsonb_array_length(v_cards) <> 2 then
    raise exception 'expected one card per contributor, got %', v_cards;
  end if;
  if v_cards::text like '%' || v_owner::text || '%' then
    raise exception 'owner pages became a card';
  end if;
  if (v_cards->0->>'contributorId') <> v_explorer::text
     or (v_cards->0->>'pageCount')::integer <> 2
     or (v_cards->0->>'photoPath') <> 'books/explorer-first.jpg'
     or (v_cards->0->>'authorName') <> 'Judge' then
    raise exception 'explorer card was wrong: %', v_cards->0;
  end if;
  if (v_cards->1->>'contributorId') <> v_stranger::text
     or (v_cards->1->>'pageCount')::integer <> 1 then
    raise exception 'stranger card was wrong: %', v_cards->1;
  end if;

  v_coupon := public.thank_book(v_shop, v_explorer, 'Free coffee', 7);
  if v_coupon is null then
    raise exception 'give coupon created no coupon';
  end if;
  select count(*), bool_or(demo_repeat)
    into v_count, v_repeat
  from public.coupons
  where holder_id = v_explorer
    and shop_id = v_shop;
  if v_count <> 1 or v_repeat is not true then
    raise exception 'expected one demo_repeat coupon, count % repeat %', v_count, v_repeat;
  end if;

  begin
    perform public.thank_book(v_shop, v_explorer, 'Another', 1);
    raise exception 'a second thanks was allowed';
  exception
    when others then
      if sqlerrm <> 'already_decided' then
        raise;
      end if;
  end;

  select count(*) into v_count from public.coupons where holder_id = v_explorer and shop_id = v_shop;
  if v_count <> 1 then
    raise exception 'second thanks created another coupon';
  end if;

  v_cards := public.owner_inbox()->'bookThanks';
  if v_cards::text like '%' || v_explorer::text || '%' then
    raise exception 'thanked card stayed visible';
  end if;
  if jsonb_array_length(v_cards) <> 1 then
    raise exception 'stranger card disappeared early: %', v_cards;
  end if;

  perform public.dismiss_book_thanks(v_shop, v_stranger);
  v_cards := public.owner_inbox()->'bookThanks';
  if jsonb_array_length(v_cards) <> 0 then
    raise exception 'dismiss left a card: %', v_cards;
  end if;

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  v_cards := public.owner_inbox()->'bookThanks';
  if jsonb_array_length(v_cards) <> 0 then
    raise exception 'non-owner saw cards: %', v_cards;
  end if;
  begin
    perform public.thank_book(v_shop, v_explorer, 'Nope', 7);
    raise exception 'non-owner sent a coupon';
  exception
    when others then
      if position('not a verified owner' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.reset_demo();

  if exists (
    select 1 from public.book_thanks
    where shop_id = v_shop and contributor_id = v_explorer
  ) then
    raise exception 'reset left a demo book-thanks decision';
  end if;
  if not exists (
    select 1 from public.book_thanks
    where shop_id = v_shop and contributor_id = v_stranger and decision = 'dismissed'
  ) then
    raise exception 'reset cleared a real shopper decision';
  end if;
  if exists (select 1 from public.coupons where shop_id = v_shop and holder_id = v_explorer) then
    raise exception 'reset left the demo coupon';
  end if;

  insert into public.shop_book_pages (shop_id, kind, image_path, contributed_by)
  values (v_shop, 'menu', 'books/explorer-again.jpg', v_explorer);

  v_cards := public.owner_inbox()->'bookThanks';
  if jsonb_array_length(v_cards) <> 1
     or (v_cards->0->>'contributorId') <> v_explorer::text then
    raise exception 'reset did not bring the demo card back: %', v_cards;
  end if;
end $$;

rollback;
