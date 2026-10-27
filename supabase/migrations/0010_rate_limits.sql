-- Rate limits. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Snap and judge sign-in counts live here so every serverless instance shares them.
-- Clients cannot read or write the rows. take_rate_limit is the only writer.

create table if not exists public.rate_counters (
  bucket text not null check (bucket in ('snap', 'judge')),
  subject text not null check (char_length(subject) between 1 and 80),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, subject, window_start)
);

alter table public.rate_counters enable row level security;

drop policy if exists rate_counters_no_client on public.rate_counters;
create policy rate_counters_no_client
  on public.rate_counters
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.rate_counters from public, anon, authenticated;

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
  if p_bucket is null or p_bucket not in ('snap', 'judge') then
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
      v_limit := 20;
    else
      v_limit := 60;
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
