-- Book writes. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Anyone may add a page to an unclaimed shop. Only a verified owner,
-- or the service role during demo reset, may replace or delete pages.
-- shop_book_writes records who wrote each read.
-- Rollback: drop function if exists public.book_server_clear(uuid);
-- drop table if exists public.shop_book_writes;

create table if not exists public.shop_book_writes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  page_id uuid,
  user_id uuid,
  action text not null check (action in ('add', 'replace', 'delete')),
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.shop_book_writes enable row level security;

revoke all on table public.shop_book_writes from public, anon, authenticated;

create index if not exists shop_book_writes_shop_idx
  on public.shop_book_writes (shop_id, created_at desc);

comment on table public.shop_book_writes is
  'Who wrote each book read. The server inserts the row. Clients have no policy.';

create or replace function public.book_server_clear(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'server_only';
  end if;
  insert into public.shop_book_writes (shop_id, page_id, user_id, action)
  select shop_id, id, null, 'delete'
  from public.shop_book_pages
  where shop_id = p_shop_id
    and status = 'live';
  update public.shop_book_pages
  set status = 'removed',
      removed_at = pg_catalog.now()
  where shop_id = p_shop_id
    and status = 'live';
end;
$$;

revoke all on function public.book_server_clear(uuid) from public, anon, authenticated;
grant execute on function public.book_server_clear(uuid) to service_role;
