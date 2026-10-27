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
- `/map` shows the demo map from a local shop fixture. It does not query a shop table.
- `/snap` matches a photo to a demo shop. It does not require a session.
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

`/snap` opens the phone camera, resizes the photo on the device, and asks Spark which nearby demo shop it is. Confirm the guess, or pick from the list. The photo is not stored, and nothing is written to the database.

`META_API_KEY` is required for `/api/analyze`. The name is the only value in the repo. Without it the route returns `ai_not_configured`.
- Shop photo matching: placeholder, not implemented in this scaffold.
- Live map: MapLibre demo pins from `lib/fixtures`. No shop table is queried.
