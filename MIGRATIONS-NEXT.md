# Next migrations

`0018` through `0026` are applied on prod. That is 26 files through 0026.

1. `0018_claim_capture.sql` and `0020_book_writes.sql` are applied on prod.
2. The corrected `0019_posts_server_only.sql` is applied on prod. Its 5-argument `create_post` wrapper keeps the live signature, including `p_facts` default null. Drop that wrapper later, in its own migration.
3. `0021_private_photos.sql` is applied on prod.
4. `0022_farm_to_go_name.sql` replaces `reset_demo` so slug `mala-mafia` resets to Farm to Go (demo). The id and slug stay. Applied on prod.
5. `0024_demo_shop_coords.sql` moves only the eight `is_demo` shop pins. Applied on prod. Rollback: `supabase/rollbacks/0024_demo_shop_coords.sql`. It does not replace `reset_demo`.
6. `0025_thuk_jai_street.sql` moves only the `is_demo` row for `thuk-jai-chieo` off the San Paolo Hospital footprint. Applied. Rollback: `supabase/rollbacks/0025_thuk_jai_street.sql`.
7. `0026_demo_pin_gap.sql` moves only the `is_demo` rows for `mala-mafia` and `coconut-shake-stand` so their pins do not overlap on the fitted demo map. Applied. Rollback: `supabase/rollbacks/0026_demo_pin_gap.sql`.

Files `0001` through `0017` stay in filename order before these.
