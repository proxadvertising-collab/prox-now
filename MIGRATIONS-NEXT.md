# Next migrations

Apply these only after the captain writes apply. None of them are applied by the app.

1. `0018_claim_capture.sql` and `0020_book_writes.sql` any time before the deploy.
2. `0019_posts_server_only.sql` before or with the deploy. The temporary 5-argument `create_post` wrapper keeps the live app working. Drop that wrapper after the deploy.
3. `0021_private_photos.sql` only after the new deploy is live.

Files `0001` through `0017` stay in filename order before these four.
