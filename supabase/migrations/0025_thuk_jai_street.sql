-- Thuk Jai Chieo pin. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- 0024 put the is_demo row for thuk-jai-chieo at 12.56366 N, 99.95917 E, on the San Paolo Hospital footprint.
-- This moves only that is_demo row to a street-side point about a 7 minute walk from 12.5684 N, 99.9577 E.
-- A shop that is not is_demo is left where it is, even if the slug matches.
-- Running it again writes the same point.
-- reset_demo does not assign lat or lng, so a reset leaves this point in place.
-- Rollback: supabase/rollbacks/0025_thuk_jai_street.sql

update public.shops as shops
set lat = 12.56510,
    lng = 99.96140
where shops.slug = 'thuk-jai-chieo'
  and shops.is_demo = true
  and (shops.lat is distinct from 12.56510 or shops.lng is distinct from 99.96140);
