# Next migrations

Apply these only after the captain writes apply. None of them are applied by the app.

1. `0018_claim_capture.sql` and `0020_book_writes.sql` go before the deploy.
2. The corrected `0019_posts_server_only.sql` goes just before the deploy. Its 5-argument `create_post` wrapper keeps the live signature, including `p_facts` default null. Drop that wrapper later, in its own migration.
3. `0021_private_photos.sql` goes only after the new deploy is live.

Files `0001` through `0017` stay in filename order before these four.
