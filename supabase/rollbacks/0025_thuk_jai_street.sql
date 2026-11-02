-- Rollback for 0025_thuk_jai_street.sql. Not applied by the app or by tests.
-- Restores the 0024 point for this one is_demo row. It does not restore the pre-0024 cluster.

update public.shops as shops
set lat = 12.56366,
    lng = 99.95917
where shops.slug = 'thuk-jai-chieo'
  and shops.is_demo = true
  and (shops.lat is distinct from 12.56366 or shops.lng is distinct from 99.95917);
