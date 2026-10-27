-- Demo accounts. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- The assistant creates the two users and inserts their ids here.
-- This file has no email and no password.
-- A person can read only their own row. Clients cannot insert or update.

create table if not exists public.demo_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('explorer', 'owner'))
);

alter table public.demo_accounts enable row level security;

drop policy if exists demo_accounts_select_own on public.demo_accounts;
create policy demo_accounts_select_own
  on public.demo_accounts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.demo_accounts from public, anon, authenticated;
grant select on table public.demo_accounts to authenticated;
