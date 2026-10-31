-- Checks for 0019. This file is not applied. Do not run it on a live database
-- from the app. Run it only in a database where 0019 has already been applied.
--
-- The trigger stamps expires_at and ready_at only on insert.
-- demo_end_window sets both clocks.
-- Pass and the owner inbox wait on coalesce(ready_at, expires_at).

do $$
declare
  v_trigger text;
  v_demo text;
  v_pass text;
  v_inbox text;
begin
  v_trigger := pg_get_functiondef('public.posts_set_expiry()'::regprocedure);
  if position('if tg_op = ''INSERT'' then' in v_trigger) = 0 then
    raise exception 'trigger must stamp times only on insert';
  end if;
  if position('new.expires_at := old.expires_at' in v_trigger) > 0 then
    raise exception 'trigger must not reset expires_at on update';
  end if;

  v_demo := pg_get_functiondef('public.demo_end_window(uuid)'::regprocedure);
  if position('expires_at = now()' in v_demo) = 0 or position('ready_at = now()' in v_demo) = 0 then
    raise exception 'demo_end_window must set ready_at and expires_at';
  end if;

  v_pass := pg_get_functiondef('public.pass_post_begin(uuid)'::regprocedure);
  if position('coalesce(v_ready_at, v_expires_at)' in v_pass) = 0 then
    raise exception 'pass must wait on ready_at';
  end if;

  v_inbox := pg_get_functiondef('public.owner_inbox()'::regprocedure);
  if position('coalesce(p.ready_at, p.expires_at)' in v_inbox) = 0 then
    raise exception 'inbox must wait on ready_at';
  end if;
end $$;

-- A 5-argument create_post call resolves to exactly one function.
-- The 6-argument function has no defaults, so it cannot take that call.

do $$
declare
  v_match int;
  v_defaults int;
begin
  select count(*) into v_match
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_post'
    and p.pronargs >= 5
    and (p.pronargs - p.pronargdefaults) <= 5;

  if v_match <> 1 then
    raise exception 'a 5-argument create_post call must resolve to exactly one function';
  end if;

  select p.pronargdefaults into v_defaults
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_post'
    and p.pronargs = 6;

  if v_defaults is null or v_defaults <> 0 then
    raise exception 'the 6-argument create_post must have no defaults';
  end if;
end $$;
