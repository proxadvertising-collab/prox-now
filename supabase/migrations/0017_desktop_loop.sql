-- Apply it only after the captain writes apply.
-- Posts remember whether the fix was GPS, a dropped pin, or the demo street.
-- cancel_claim deletes only the caller's own pending row.

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
    and status = 'pending';
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.cancel_claim(uuid) from public, anon;
grant execute on function public.cancel_claim(uuid) to authenticated;
