# Add-a-shop v1: real shops from the database, and "Add this shop" from a snap

Written for Grok Build. Source of truth for the mission. Reuse: lib/ai/matcher.ts, components/snap/SnapFlow.tsx, lib/geo.ts, lib/fixtures/shops.ts, lib/copy.ts (en and th, keep the parity test green), lib/supabase/*, lib/db/types.ts. No new dependencies. Migrations are files only: never apply them, never run seeds.

## 1. Migration supabase/migrations/0002_user_shops.sql (new file; check 0001 for names)
- `alter table public.shops` add: `created_by uuid references public.profiles(id) on delete set null`, `source text not null default 'seed' check (source in ('seed','user'))`. Existing rows keep source 'seed'.
- Function `public.create_shop_from_snap(p_name text, p_name_local text, p_category text, p_lat double precision, p_lng double precision, p_address_hint text default null) returns public.shops` SECURITY DEFINER, `set search_path = public`, language plpgsql:
  - Requires `auth.uid()` not null, otherwise raise 'not_signed_in'.
  - Trims inputs. name 2 to 80 chars; name_local up to 80 or null; category must be in the existing list, else 'other'; lat and lng within range, else raise 'bad_location'.
  - Rate limit: at most 20 shops per user per rolling 24 hours (count where created_by = auth.uid()), else raise 'rate_limited'.
  - Dedupe: if a shop already exists within 40 m (use a haversine expression or the existing nearby_shops helper) whose lower(name) or lower(name_local) equals the new one, return that existing row instead of inserting.
  - Slug: lower-case ascii slug from the name (fall back to 'shop'), plus '-' and 6 random hex chars, retry on conflict. country_code, timezone, currency use the column defaults. claimed false, is_demo false, source 'user', created_by auth.uid().
  - `revoke all on function ... from public, anon; grant execute ... to authenticated;`
- RLS on shops stays as is; no direct insert policy for clients.
- A pgTAP-free vitest in lib/db/migration.test.ts style: assert the file contains security definer, the revoke, the grant to authenticated only, the rate limit, the dedupe, and no service_role.

## 2. Shop source: lib/shops/source.ts
- `getShopsNear(point)`: when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set, call the existing `nearby_shops` RPC (radius 600 m, max 10) with a server Supabase client (anon, no user needed because shops are public to anon); on any error or an empty result in demo mode, fall back to lib/fixtures/shops.ts. When the env vars are missing, use fixtures only. Return the same shape selectCandidates uses (id, name, nameLocal, category, distanceM, lat, lng).
- Change /api/analyze to use getShopsNear for its candidates instead of fixtures directly. If the matcher returns a shop id that exists, use it. Keep the 11 existing route tests green and add tests with a mocked supabase client (db result used; db error falls back to fixtures).
- Map: if the env vars are set, load shops from the database with a server fetch of all non-demo shops within 5 km of the map centre (cap 200); otherwise fixtures. Keep the demo banner only when fixtures are used.

## 3. "Add this shop" in the snap flow
- When the decision is "pick-all", or the person taps "None of these" in the pick list, show an "Add this shop" screen (new state `add`). Prefill from the matcher result: name from the first sign_text item that looks like a shop name (the matcher result already has signText and category); nameLocal from the Thai (or other script) original; category from the matcher category mapped to the allowed list (street food, drinks, restaurant, fruit, laundry, home services, barber, other), default other. All fields editable. Show the GPS used ("Using your location") and a small note if it is the demo fallback (then disable saving: "Turn on location to add a shop").
- Save calls a server action or route `POST /api/shops` that requires a signed-in user (use the SSR Supabase client from lib/supabase/server.ts), calls the `create_shop_from_snap` RPC, maps the errors (not_signed_in to a sign-in prompt that links to /login?next=/snap, rate_limited, bad_location) to friendly copy, and returns the shop. On success show "Pin ready for <shop>" with an "Added a new shop" line and a "Snap another" button. Still no post, no photo is saved.
- Copy keys in en and th for every new string. Keep touch targets 44 px or larger and the dark theme tokens.
- /snap stays public, but the Add step needs sign-in: when signed out, tapping Save shows "Sign in to add this shop" with a button to /login?next=/snap. Keep the entered values across the sign-in (sessionStorage), and restore them when the person returns.

## 4. Tests and docs
- Vitest, no network: the migration text test, getShopsNear with mocked client, /api/shops with mocked client (signed out 401, success, rate_limited, bad input 400), the prefill mapper (pure function lib/snap/prefill.ts: sign text and category in, name, nameLocal, category out) with at least 8 cases including Thai, mixed Thai and English, and empty input. Existing 47 tests stay green.
- README: add a short "Shops" section: where shops come from, that new shops are user-created and claimable later, and env var names only.
