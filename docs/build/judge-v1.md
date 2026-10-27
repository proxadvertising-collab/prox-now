# judge-v1: make the live product judge-proof (Nov 5-8)

Why: judges open the LIVE site from their own location at unknown times. An empty map, a login wall, or a coupon that can't be tested is a lost Demo score. Everything here is built and seeded inside this repo during the event.

Design lens for every item: a judge should reach the wow moment in under 60 seconds with zero typing.


## SCOPE (tightened): build CORE now, STRETCH only after Gate A
CORE (must ship, in this order): (5) provenance audit and tests; (1) demo zone with seed flag and Demo pill; (2) `/judge` page with two buttons plus the email and password fallback, demo_accounts, rate limits; (3) demo sessions open on demo_zone(), the "Explore the demo zone" chip for everyone, and the `demo_end_window` Decide-now button plus the coupon-per-day exemption on demo shops; (4) the Behind-the-scenes AI panel; (6) AI-resting fallback.
STRETCH (skip unless the captain says go): sample-photo strip, demo role-switch banner button, demo_reset and its schedule, "How the AI saw this" on map sheets, the demo location picker (use nearest demo shop only).

## 1. Demo zone (migration 0007_demo_zone.sql, file only)
- `shops.is_demo boolean not null default false`; `posts.is_seed boolean not null default false`.
- `public.demo_zone()` (security invoker, public execute): returns center lat, lng and zoom, computed as the centroid of `shops where is_demo`. Fallback if none: the Soi 102 point.
- Seed posts (`is_seed = true`) get `expires_at = '2026-11-12 00:00+00'` so they outlive judging and the Nov 9 finals. They never enter the Keep/Pass inbox (owner_inbox and expired_undecided must exclude is_seed).
- Seed posts are NOT faked: they are real photos taken at real shops and posted through the real app pipeline (blur included). The assistant flags them is_seed by SQL after the captain posts them. No generated or imported images.
- UI for seed posts: a small "Demo" pill and a full ring that says "Live demo" (no fake countdown). Real user posts keep the real 2-hour ring.
- Backstop: `public.demo_reset()` deletes non-seed posts and coupons made by the demo explorer account older than 24 hours, and the matching storage objects are left for the owner flow. Scheduling it with pg_cron is done by the assistant, not in the repo.

## 2. Demo accounts and zero-typing entry
- Table `demo_accounts(user_id uuid primary key references auth.users, role text check (role in ('explorer','owner')))` with RLS: a user can select only their own row. The assistant creates the two users and fills the table; no passwords or emails in the repo.
- Owner account is a verified owner (shop_owners status verified) of exactly one `is_demo` shop. Explorer is a normal user.
- Sign-in without Google or an inbox: `/judge` page (public, linked from the README and the login page footer): two big buttons "Try it as a shopper" and "Try it as a shop owner", plus a small email and password form as fallback. Buttons call a server route `/api/judge/enter?role=` that signs in with server-only env vars `DEMO_EXPLORER_EMAIL`, `DEMO_EXPLORER_PASSWORD`, `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD` (never in client code, never in the repo). If the vars are missing the route returns a friendly 503.
- Rate limits on `/api/judge/enter` and on snap analysis so a bot cannot burn Meta credits: 20 snaps per user per hour and 60 per IP per hour, with a friendly message.
- In demo sessions a slim banner shows: "Demo mode, Hua Hin Soi 102", a "Switch to shop owner / shopper" button (calls `/api/judge/switch`, signs out and in as the other demo account), and "Use my real location".

## 3. Map and snap behave for a judge anywhere
- Demo sessions open the map on `demo_zone()` regardless of GPS.
- Everyone else: if there are no live posts within 25 km of the viewer, show a chip "Nothing live near you yet. Explore the demo zone" that recenters on the demo zone. (Judges who skip the demo login still see a full map.)
- Snap for demo sessions: location is a chosen demo shop's point (default the nearest demo shop, picker to change), real GPS ignored; show "Demo location: <shop>". A "No shop handy? Use a sample photo" strip with 4 sample storefront photos in `public/demo-photos/` (photos taken by the captain at Soi 102 during the event; Grok creates the folder and a README, the captain adds the files). Sample photos go through the full real pipeline: match, facts, face detect, blur.
- Demo explorer is exempt from the one-coupon-per-person-per-shop-per-local-day rule on `is_demo` shops (judges will try several times): adapt the constraint, keep it for all non-demo shops.
- Owner side in demo: `owner_inbox` also lists live posts at the demo shop in a "Live now (demo)" group with a "Decide now" button that calls `demo_end_window(post_id)` (verified owner AND shop.is_demo AND not is_seed only), which sets expires_at = now() so Keep/Pass opens immediately. Real shops are unchanged.

## 4. "Behind the scenes" AI panel (tooling is 25% of the score)
- In the snap flow, after analysis, a visible strip (expandable) that prints what actually happened, read from the real API responses, never hardcoded: model id returned by Meta, shop match and confidence, number of faces found and blurred, sign text found and the language pair translated, latency per step.
- Same panel is available on a shop's post in the map sheet as "How the AI saw this".
- Truth rule: only name a model that the code really calls. Today face blur uses Spark face boxes plus sharp, not SAM 3.1. The panel must say what is true. (SAM 3.1 is a separate decision for the captain.)

## 5. Fresh-data and provenance proof
- `docs/PROVENANCE.md`: what pre-existed (framework, open-source libraries, Meta API, Supabase and Vercel services) and what was built in the event window (everything else), with the date of the first commit.
- `scripts/audit-fresh.mjs` plus a Vitest test (already built in section 5) that fails if the repo contains any forbidden production-product string listed in the script, or any file under public/ not listed in `public/ASSETS.md`.
- Grok runs `git log --reverse --format='%h %ad %s' --date=iso | head -5` and reports whether any commit predates 2026-10-26 16:00 UTC (event start, noon ET). If one does, STOP and report; do not rewrite history.
- Secrets scan: no `.env*` tracked, nothing key-shaped in history (`git log -p` grep for `sk-`, `eyJ`, `META_API_KEY=`). Report results.

## 6. Keep it live
- No teardown, no cron that depends on an admin key. Seed posts expire after Nov 12. Demo accounts keep working.
- If Meta calls fail (credits out or rate limited) the snap flow shows a friendly "AI is resting, try again in a minute" and never crashes; test it.
- After Nov 4 deploys only for fixes, each one tested first.

## Acceptance
- Tests added for: demo_zone fallback, is_seed excluded from the inbox, demo_end_window permission (non-owner, non-demo shop, seed post all rejected), /api/judge/enter without env, the nearest-demo chip logic, the audit test.
- `npm run build` passes. Report: branch, commits, test count, files changed, open questions.
