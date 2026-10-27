# prox-now
Prox Now: Meta Global AI Developer Hackathon

## What Prox Now is

Prox Now is a mobile-first web app. A shopper snaps a photo of a local shop, the AI matches the shop, and a live pin shows on a map for 2 hours.

## Hackathon

Built during the Meta Global AI Developer Hackathon, Oct 26 to Nov 4 2026, all code written this week.

## How to run

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Copy `.env.example` to `.env.local` and set the values on your machine. Do not commit that file.

```bash
npm test
npm run build
```

## Design system

Tokens, type, motion, and the app shell are specified in [docs/design/DESIGN.md](docs/design/DESIGN.md). Screen notes are in [docs/design/SCREENS.md](docs/design/SCREENS.md).

Regenerate the home-screen icons (180, 192, 512, and maskable 512) with:

```bash
npm run icons
```

Routes in this scaffold:

- `/login` signs in with Google or a 6-digit email code.
- `/auth/callback` finishes the sign-in redirect.
- `/map` shows shops from the database when the Supabase env vars are set, and the local fixture otherwise.
- `/snap` matches a photo to a nearby shop. It does not require a session. Adding a shop does.
- `/wallet` and `/inbox` send a signed-out visitor to `/login`.
- `GET /api/health` returns `{ ok: true, time }`.
- `GET /api/meta-ping` makes one server-side Meta API call.

## Environment variables

`.env.example` lists the names only. Set values in `.env.local`.

- `META_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is unused in this scaffold.

## Where Meta models are used

- `muse-spark-1.3` in `GET /api/meta-ping` (one server-side proof call to `https://api.meta.ai/v1/responses`).
- `muse-spark-1.3` in `POST /api/analyze` matches a shop photo. The photo is not stored.

## Snap pipeline

`/snap` opens the phone camera, resizes the photo on the device, and asks Spark which nearby shop it is. Confirm the guess, pick from the list, or add the shop. Posting that shop to the map is a separate step. The original photo is not stored.

`META_API_KEY` is required for `/api/analyze`. The name is the only value in the repo. Without it the route returns `ai_not_configured`.

## Shops

Shops on the map and in the photo matcher come from `public.shops` when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Otherwise the app uses the local Soi 102 fixture and shows the demo banner.

A signed-in person can add a shop from `/snap`. That calls `create_shop_from_snap`. The new row has `source = user` and can be claimed later. The photo is not stored.

## Posts

A signed-in person can post a confirmed, picked, or newly added shop. The pin stays up for 2 hours. Spark marks faces, and the server blurs them before anything is saved. Only that blurred JPEG is stored, in the public `post-photos` bucket. The original photo is not stored. EXIF, including GPS, is stripped and not stored.

The map draws a countdown ring on shops that have a live post. `POST /api/posts` and the live pin query need `META_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` is not used.

`supabase/migrations/0003_post_photos.sql` is a migration file only until it is applied.

## What we read from a photo

One Spark call reads facts about the place and the moment. Missing or malformed facts are dropped. They are not invented.

- A caption of what is shown or sold, at most 140 characters, with no people. English and Thai captions are kept when the model can write them. The sheet shows the viewer's language, then English, then the original sign text.
- Up to eight item names. A price and an ISO currency stay only when the number is clearly readable.
- Crowd level: empty, a few people, busy, or a queue.
- Whether the place looks open, closed, or unknown.
- Up to five signals: a fresh batch, a promo, sold out, an event, music, or a new item.
- The language of the sign, as a BCP-47 tag, when it is clear. If it differs from the viewer's language, the sheet says it was translated.

The model never identifies anyone and never describes a person's appearance beyond crowd level. The original photo is never stored. Only the blurred JPEG is kept.

`supabase/migrations/0005_post_facts.sql` is a migration file only until the captain writes apply. Until that file is applied, a post still saves and the facts are left unsaved.

## Places

Prox Now adds a live layer and seeds places that map data is missing. It does not replace any map.

`GET /api/places/export` is a public GeoJSON FeatureCollection of shops people added. Each feature is a point with the shop name, a local name when one was saved, the category, a country and address hint when present, a public phone when present, and a `prox-now` source record. Confidence is 0.6 because a person reported the place. The list is capped at 5000 and can be filtered with `country` and `since`.

The export does not include who added the shop, email addresses, or any user id. Demo shops and seed shops are left out. `GET /api/places/stats` counts places, countries, posts, and how many posts are still live.

A new shop stores a country from the `x-vercel-ip-country` header when that header is present, the browser timezone when it is a real IANA zone, and a currency only when the country is in the tested table. Missing values stay empty. They are not filled in with a Thailand default. `supabase/migrations/0004_shop_worldwide_fields.sql` is a migration file only until it is applied. The export and the stats query need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
