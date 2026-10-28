-- Stack live photos. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- One person may keep up to 10 live photos at one shop. Each photo still
-- expires on its own 2-hour clock. The one-live-photo exception is gone.
-- The daily cap is 40 non-seed posts per person per 24 hours. Seed posts
-- are excluded. Book pages and shop rows live in other tables, so they
-- are not counted. Book uploads use a separate rate bucket: 60 per user
-- and 120 per IP each hour. Snap analyze stays on the snap bucket.

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
      and coalesce(is_seed, false) = false
      and created_at > now() - interval '24 hours'
  ) >= 40 then
    raise exception 'rate_limited';
  end if;

  if (
    select count(*)
    from public.posts
    where author_id = v_uid
      and shop_id = p_shop_id
      and status = 'live'
      and expires_at > now()
      and coalesce(is_seed, false) = false
  ) >= 10 then
    raise exception 'shop_full';
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

revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;

-- Widen the bucket check, then replace the counter. Unknown names still
-- raise bad_bucket. The app treats that as "migration not applied yet"
-- and counts book uploads in process memory until this file is applied.

do $drop_bucket$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'rate_counters'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%bucket%'
  loop
    execute format('alter table public.rate_counters drop constraint %I', v_name);
  end loop;
end
$drop_bucket$;

alter table public.rate_counters
  add constraint rate_counters_bucket_check
  check (bucket in ('snap', 'judge', 'book'));

create or replace function public.take_rate_limit(p_bucket text, p_subjects text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_subjects text[];
  v_subject text;
  v_limit integer;
  v_hits integer;
begin
  if p_bucket is null or p_bucket not in ('snap', 'judge', 'book') then
    raise exception 'bad_bucket';
  end if;
  if p_subjects is null or cardinality(p_subjects) = 0 then
    raise exception 'bad_subject';
  end if;

  select coalesce(array_agg(distinct subject order by subject), array[]::text[])
    into v_subjects
  from unnest(p_subjects) as subject
  where subject is not null;

  if cardinality(v_subjects) = 0 then
    raise exception 'bad_subject';
  end if;

  v_window := date_trunc('hour', pg_catalog.now());

  foreach v_subject in array v_subjects loop
    if v_subject !~ '^(user|ip):[^[:space:]]{1,64}$' then
      raise exception 'bad_subject';
    end if;
    if left(v_subject, 5) = 'user:' then
      if p_bucket = 'judge' or auth.uid() is null or v_subject <> 'user:' || auth.uid()::text then
        raise exception 'bad_subject';
      end if;
      if p_bucket = 'book' then
        v_limit := 60;
      else
        v_limit := 20;
      end if;
    else
      if p_bucket = 'book' then
        v_limit := 120;
      else
        v_limit := 60;
      end if;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_bucket || ':' || v_subject || ':' || v_window::text)::bigint
    );

    delete from public.rate_counters
    where bucket = p_bucket
      and subject = v_subject
      and window_start < v_window;

    select hits
      into v_hits
    from public.rate_counters
    where bucket = p_bucket
      and subject = v_subject
      and window_start = v_window;

    if coalesce(v_hits, 0) >= v_limit then
      return false;
    end if;
  end loop;

  foreach v_subject in array v_subjects loop
    insert into public.rate_counters (bucket, subject, window_start, hits)
    values (p_bucket, v_subject, v_window, 1)
    on conflict (bucket, subject, window_start)
    do update set hits = public.rate_counters.hits + 1;
  end loop;

  return true;
end;
$$;

revoke all on function public.take_rate_limit(text, text[]) from public;
grant execute on function public.take_rate_limit(text, text[]) to anon, authenticated;
