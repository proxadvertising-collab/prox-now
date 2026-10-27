# Posts v1: publish a blurred photo as a live 2-hour pin, show live pins on the map

Written for Grok Build. Source of truth for the mission. Reuse: lib/ai/meta.ts, lib/ai/matcher.ts (buildMatcherPrompt, parseMatcherResult), lib/geo.ts, lib/shops/source.ts, lib/supabase/*, components/snap/SnapFlow.tsx, components/map/*, components/ui/*, lib/copy.ts (en + th, parity test stays green), lib/freshness.ts. Read docs/design/DESIGN.md and SCREENS.md only for the map sheet and pin look. Migrations are files only (next number: 0003).

## Principles
- Fail closed: if the AI cannot find faces (error, timeout, bad JSON) the photo is NOT published. The user sees a plain retry message. Never publish an unblurred photo.
- Every face the AI reports is blurred by default, padded 25 percent on each side. No unblur option in this task. The original photo is never stored anywhere.
- A client can never choose created_at, expires_at, status, author_id, or photo_path. The server sets them.

## 1. Migration: supabase/migrations/0003_post_photos.sql (file only, never applied)
- Create storage bucket `post-photos` (public read, file size limit 600 KB, allowed mime image/jpeg) with `insert into storage.buckets ... on conflict (id) do nothing`.
- Storage policies on storage.objects for bucket post-photos: select for anon and authenticated; insert for authenticated only where the first folder in the object name equals (select auth.uid())::text; no update, no delete policies (deletes are done by a server function later).
- Index posts (shop_id, status, expires_at) if not already covered, and posts (author_id, created_at desc).
- Function public.create_post(p_shop_id uuid, p_photo_path text, p_text_original text, p_text_translated jsonb) returns public.posts, security definer, set search_path = public: requires auth.uid(); the shop must exist; p_photo_path must start with auth.uid()::text || '/'; at most 10 posts per user per 24 hours (raise 'rate_limited'); at most 1 live post per user per shop at a time (raise 'already_live'); text_original max 400 chars, text_translated must be a jsonb object with at most 6 keys; inserts status 'live', is_demo false, author_id auth.uid(); the existing trigger sets created_at and expires_at. Revoke from public and anon, grant execute to authenticated. Add a migration test like lib/db/migration.test.ts checks (text assertions on the SQL file).
- Note in the file header: apply only after the captain writes apply.

## 2. Face blur: lib/image/blur.ts (server only, pure, tested)
- Add `sharp` to dependencies (captain explicitly approves editing package.json and package-lock.json for this one dependency only; use the version Next already installs if present).
- `blurFaces(jpeg: Buffer, boxes: number[][], opts)` takes normalized [x1,y1,x2,y2] boxes (0..1, origin top-left), clamps, pads 25 percent, and for each box blurs that region heavily (sharp gaussian blur sigma scaled to box size, minimum 12; or pixelate by shrinking to 8 px wide and scaling up with nearest neighbour). Returns a JPEG buffer, max edge 1024, quality 80, stripped of ALL metadata (no EXIF, no GPS). `normalizeBoxes` drops invalid boxes, caps at 20 boxes, merges heavily overlapping ones. Tests: a generated test image with a solid-colour square keeps outside pixels identical and changes pixels inside the box; metadata is gone; bad boxes are dropped.

## 3. Route: app/api/posts/route.ts (POST multipart: image, shopId, lat, lng)
- `export const maxDuration = 60` only (no runtime export; cacheComponents forbids it). Require a signed-in Supabase session via lib/supabase (401 { error: "not_signed_in" } otherwise). Validate image (jpeg/png/webp, 3 MB max), shopId uuid, lat/lng numbers; the shop must exist and be within 300 m of lat/lng (haversine on its stored coordinates), else 400 { error: "too_far" }.
- Call Spark once with buildMatcherPrompt for that single shop as the only candidate (so we get faces, sign_text, quality score). If the call fails, times out, or parseMatcherResult yields the safe default with no faces field validly present, return 503 { error: "blur_unavailable" } and publish nothing. If qualityScore is 2 or lower return 422 { error: "photo_unusable" }.
- blurFaces, then upload the JPEG to bucket post-photos at `${userId}/${postId}.jpg` using the user's own session client (RLS enforces the folder), then call rpc create_post. If the RPC fails after upload, delete the uploaded object with the same session client if allowed, otherwise leave it and report. Map rpc errors: rate_limited 429, already_live 409.
- Response: { post: { id, shopId, photoUrl, createdAt, expiresAt }, facesBlurred: number }.
- sign_text becomes text_original (items joined with " | ", original script) and text_translated { en: ..., th: ... } using the translated English text under "en" and the original under its own language only if known; keep it simple: { en: translated joined }. 
- Tests with mocked fetch and a mocked supabase client (no network): signed out gives 401; too_far gives 400; Spark failure gives 503 and nothing uploaded; faces get blurred before upload (assert the uploaded buffer differs inside the box); rate_limited maps to 429.

## 4. Snap flow: components/snap/SnapFlow.tsx
- After the shop is confirmed or picked (or just added) show "Post this to the map" primary button with a plain line "Faces are blurred. Your pin stays up for 2 hours." Signed-out users are sent to /login?next=/snap as with Add this shop, keeping state in sessionStorage. On success show "You're live at <shop>" with a live 2:00:00 countdown, a "See it on the map" link to /map?post=<id>, and "Snap another". Replace the old "Demo: not posted yet" note. Errors in plain words with Retry (blur_unavailable: "We could not blur faces just now. Nothing was posted. Try again."). Add en and th copy keys, parity test green.

## 5. Map: live pins
- lib/posts/source.ts `getLivePosts()` selects posts with status live and expires_at in the future joined to shops (id, shop_id, photo_path to public URL, text_original, text_translated, created_at, expires_at, shop name, nameLocal, lat, lng, category) from Supabase when env is set; fixtures fallback returns [] (no fake live posts). Pure helpers `timeLeft(expiresAt, now)` -> { ms, label "1h 42m", fraction 0..1 } and `walkingMinutes(distanceM)` (80 m per minute, rounded up, min 1), both unit tested.
- components/map/ProxMap.tsx: a shop with a live post shows a highlighted pin with a countdown ring (SVG ring from fraction) in the accent colour; shops without a post keep the plain pin. Subscribe to Supabase Realtime INSERT on public.posts (channel per page) and refetch live posts; also refetch every 60 s and drop expired ones every 15 s on the client. If Realtime is unavailable just rely on polling.
- Tapping a live pin opens the bottom sheet: the blurred photo, shop name (local name first when the viewer's language matches), translated text in the viewer's language when present, a countdown label, distance and "N min walk" from the user's location when known, and a big "Go now" button that opens https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking in a new tab. `/map?post=<id>` opens that post's sheet on load. Touch targets at least 44 px, dark mode default.
- Do not add photographer names yet (public name view comes later). Do not show posts older than expires_at. Kept/passed handling is NOT in this task.

## 6. Tests, docs, report
- Vitest for blur, route, rpc-error mapping, timeLeft, walkingMinutes, getLivePosts mapping, copy parity. Existing 69 tests stay green; npm run build passes.
- README section "Posts": what is blurred, what is stored (blurred JPEG only), what is not (original, EXIF), env names only.
- Report: branch, commits, test count, files changed, open questions, and the exact sentence "0003 is only a file until the captain writes apply."
