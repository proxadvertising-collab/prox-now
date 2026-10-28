# shop-book-v1: Muse Spark builds every business a swipeable book

Written for Grok Build. Source of truth for the mission. Reuse: lib/ai (Meta client, matcher, face detect and blur with sharp), components/snap/SnapFlow.tsx, lib/copy.ts (en and th, keep the parity test green), lib/supabase/*, lib/db/types.ts, the existing `take_rate_limit` helper and the AI-resting fallback from judge-v1, the Behind-the-scenes panel (visible rules from step 1 F4), `claim_shop`, `shop_public`, `is_verified_owner`. Grok to inspect where the shop page and the map place sheet live. No new runtime dependencies. Migrations are files only: never apply them. Migration number: 0011 (0001 to 0010 are applied).

Why: it is the strongest "AI as the builder" story for the Indie track. The first person to snap a business gives it a page it never asked for; the owner finds a finished page and only has to claim it. Judges see Muse Spark turn a few photos into an artifact, not a caption. Every piece is event-built.

Design lens: a person adds a whole menu in under 30 seconds with no typing. A judge sees a finished book in one tap.

## 0. Truth and safety rules
- Muse Spark reads, structures and translates the REAL photos. It never draws, redraws or generates a logo, a menu or a photo. The logo page is the real photo, nothing else. (Trademark risk.)
- Show only what a photo said. Prices are copied exactly as read, never translated or converted. Anything unreadable stays out. The tagline is built only from facts on the pages (max 80 chars, no claims like "best").
- Every image goes through the existing face detect and blur pipeline BEFORE it is stored. If face detection fails, reject the image (fail closed). Book pages have no "That's me" unblur (the original is never stored); the retake path covers it.
- Book pages are kept until removed, unlike 2-hour posts. The copy says so: "Book photos stay on the shop's page until the shop or you remove them."
- Rate limits: reuse the `snap` bucket of `take_rate_limit` (20 per user per hour, 60 per IP). One upload call to Meta counts as one hit, so a 12-page menu costs one hit. Do not change `take_rate_limit`.
- Caps: 12 menu pages per shop, 1 live page for storefront, logo, hours and qr, 8 images per upload, each image at most 1 MB after client resize (long edge 1600 px, JPEG or WebP).
- Reports on book pages come from step 3 (report and block); v1 leaves a clearly named slot for the Report control on each slide and the owner can already remove any page.

## 1. Flow
1. A person posts a snap normally. On the success screen a pill shows: "Keep seeding {shop}?" (en and th). Tap goes to `/snap?seed={slug}`. The pill appears only when `book_missing(shop)` is not empty.
2. Snap in seed mode shows only what is missing for that shop, as big tiles in this order: Storefront, Logo, Hours board, Menu (food kinds only), QR code. Each tile disappears when its page exists. Tapping a tile opens the phone camera at once (file input with capture). The Menu tile also allows picking several photos (no capture) and "Add another page" after the first.
3. Upload goes to the server. The server blurs faces, stores the image, reads it with Muse Spark, saves rows, and returns the updated missing list. The tile flips to a check and slides away.
4. When nothing is missing: "{shop} has a complete page" with a button "See the book" and a small share button. If missing is still not empty the pill "Add the rest" stays on the shop page.
5. Anyone opens the book at `/book/{slug}` (and from the place sheet and the shop page). It opens translated to the viewer's language; the original is one tap away.
6. Owner side: if the shop is not claimed, a banner "Your page is already built. Claim it" calls the existing claim flow. A verified owner sees "Edit": remove any page, fix the hours, hide the book.
7. Nudges: on any place sheet or shop page where menu is missing (food kinds): button "Upload menu" with one line "No menu here yet. Add it and help the next hungry person." On the map, a shop with posts but no book gets a faint "Build its page" chip in the sheet. No push, no email.

## 2. Data model: migration 0011
File: `supabase/migrations/0011_shop_book.sql`. The full SQL is in `sql/0011_shop_book.sql` in the plan folder and is copied here so Grok can write it exactly. It creates `shop_books`, `shop_book_pages`, `shop_book_translations` (row level security on all three, select policies only, no client writes), the private-write `shop-book` storage bucket (public read, 1 MB, JPEG and WebP, no insert policy), and four functions: `book_missing`, `book_public`, `book_remove_page`, `book_owner_update`. Grok must check that every name it relies on exists in the repo (`is_verified_owner`, `profiles.display_name`, `shops.category`, `shops.claimed`) and report any mismatch instead of guessing.

```sql
-- Shop Book v1. This file is not applied by the app or by tests.
-- Apply it only after the captain writes apply.
--
-- Every business gets a public, swipeable "book": cover, hours, storefront,
-- logo, menu pages. Photos are stored by the server only, after face blur.
-- Clients cannot insert or update any of these tables directly.
-- Translations are cached per page and language.

-- shop_books -----------------------------------------------------------------

create table if not exists public.shop_books (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  status text not null default 'live' check (status in ('live', 'hidden')),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  theme jsonb not null default '{}'::jsonb,
  hours jsonb not null default '{}'::jsonb,
  source_language text
    check (source_language is null or source_language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  built_by_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_books_json_check check (
    jsonb_typeof(theme) = 'object' and pg_column_size(theme) <= 2048
    and jsonb_typeof(hours) = 'object' and pg_column_size(hours) <= 4096
  )
);

alter table public.shop_books enable row level security;

drop policy if exists shop_books_select_live_anon on public.shop_books;
create policy shop_books_select_live_anon
  on public.shop_books for select to anon
  using (status = 'live');

drop policy if exists shop_books_select_live_or_owner on public.shop_books;
create policy shop_books_select_live_or_owner
  on public.shop_books for select to authenticated
  using (status = 'live' or public.is_verified_owner(shop_id));

revoke all on table public.shop_books from public, anon, authenticated;
grant select on table public.shop_books to anon, authenticated;

-- shop_book_pages ------------------------------------------------------------

create table if not exists public.shop_book_pages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  kind text not null check (kind in ('storefront', 'logo', 'hours', 'menu', 'qr', 'other')),
  position integer not null default 0 check (position between 0 and 99),
  image_path text not null check (char_length(image_path) between 5 and 200),
  width integer check (width is null or width between 1 and 4000),
  height integer check (height is null or height between 1 and 4000),
  status text not null default 'live' check (status in ('live', 'removed')),
  contributed_by uuid references public.profiles (id) on delete set null,
  batch_id uuid,
  language text
    check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  -- What Muse Spark read from the page: { section, items: [{name, price, currency, note}] }
  extracted jsonb not null default '{}'::jsonb,
  -- What really happened: { model, latency_ms, images_in_call, call_id }. Never hardcoded.
  ai_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  constraint shop_book_pages_json_check check (
    jsonb_typeof(extracted) = 'object' and pg_column_size(extracted) <= 16384
    and jsonb_typeof(ai_meta) = 'object' and pg_column_size(ai_meta) <= 2048
  )
);

alter table public.shop_book_pages enable row level security;

-- One live page per single-page kind. Menu and other pages can be many.
create unique index if not exists shop_book_pages_one_live_single_idx
  on public.shop_book_pages (shop_id, kind)
  where status = 'live' and kind in ('storefront', 'logo', 'hours', 'qr');

create index if not exists shop_book_pages_shop_idx
  on public.shop_book_pages (shop_id, status, kind, position);

drop policy if exists shop_book_pages_select_live_anon on public.shop_book_pages;
create policy shop_book_pages_select_live_anon
  on public.shop_book_pages for select to anon
  using (
    status = 'live'
    and exists (select 1 from public.shop_books b where b.shop_id = shop_book_pages.shop_id and b.status = 'live')
  );

drop policy if exists shop_book_pages_select_auth on public.shop_book_pages;
create policy shop_book_pages_select_auth
  on public.shop_book_pages for select to authenticated
  using (
    (status = 'live'
      and exists (select 1 from public.shop_books b where b.shop_id = shop_book_pages.shop_id and b.status = 'live'))
    or contributed_by = (select auth.uid())
    or public.is_verified_owner(shop_id)
  );

revoke all on table public.shop_book_pages from public, anon, authenticated;
grant select on table public.shop_book_pages to anon, authenticated;

-- shop_book_translations (cache) ---------------------------------------------

create table if not exists public.shop_book_translations (
  page_id uuid not null references public.shop_book_pages (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  -- Same shape as extracted, translated. Prices are copied, never translated.
  extracted jsonb not null,
  -- sha256 of the source extracted json. A changed page misses the cache.
  source_hash text not null check (char_length(source_hash) = 64),
  model text,
  created_at timestamptz not null default now(),
  primary key (page_id, lang),
  constraint shop_book_translations_json_check
    check (jsonb_typeof(extracted) = 'object' and pg_column_size(extracted) <= 16384)
);

alter table public.shop_book_translations enable row level security;

drop policy if exists shop_book_translations_select_live on public.shop_book_translations;
create policy shop_book_translations_select_live
  on public.shop_book_translations for select to anon, authenticated
  using (
    exists (
      select 1 from public.shop_book_pages p
      where p.id = shop_book_translations.page_id and p.status = 'live'
    )
  );

revoke all on table public.shop_book_translations from public, anon, authenticated;
grant select on table public.shop_book_translations to anon, authenticated;

-- storage: bucket for book images (server writes with the service role) --------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-book', 'shop-book', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists shop_book_select_anon on storage.objects;
create policy shop_book_select_anon
  on storage.objects for select to anon
  using (bucket_id = 'shop-book');

drop policy if exists shop_book_select_authenticated on storage.objects;
create policy shop_book_select_authenticated
  on storage.objects for select to authenticated
  using (bucket_id = 'shop-book');

-- No insert, update or delete policy: only the server (service role) writes.

-- functions ------------------------------------------------------------------

-- What is still missing for a place. Each item disappears once a live page exists.
-- Food kinds also need a menu. After place kinds ship, this skips public places.
create or replace function public.book_missing(p_shop_id uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select array_remove(array[
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'storefront') then 'storefront' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'logo') then 'logo' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'hours')
          and coalesce((select b.hours from public.shop_books b where b.shop_id = s.id), '{}'::jsonb) = '{}'::jsonb then 'hours' end,
    case when s.category in ('street_food', 'drinks', 'restaurant', 'fruit')
          and not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'menu') then 'menu' end,
    case when not exists (select 1 from public.shop_book_pages p where p.shop_id = s.id and p.status = 'live' and p.kind = 'qr') then 'qr' end
  ], null)
  from public.shops s
  where s.id = p_shop_id;
$$;

revoke all on function public.book_missing(uuid) from public;
grant execute on function public.book_missing(uuid) to anon, authenticated;

-- The whole public book in one read. Photographer shows a display name or nothing.
create or replace function public.book_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'name_local', s.name_local,
      'category', s.category, 'timezone', s.timezone, 'currency', s.currency,
      'claimed', s.claimed, 'lat', s.lat, 'lng', s.lng
    ),
    'book', jsonb_build_object(
      'tagline', b.tagline, 'theme', b.theme, 'hours', b.hours,
      'source_language', b.source_language, 'built_by_model', b.built_by_model
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'position', p.position, 'image_path', p.image_path,
        'width', p.width, 'height', p.height, 'language', p.language,
        'extracted', p.extracted, 'ai_meta', p.ai_meta,
        'credit', (select pr.display_name from public.profiles pr where pr.id = p.contributed_by),
        'created_at', p.created_at
      ) order by
        case p.kind when 'storefront' then 0 when 'logo' then 1 when 'hours' then 2 when 'menu' then 3 else 4 end,
        p.position, p.created_at)
      from public.shop_book_pages p
      where p.shop_id = s.id and p.status = 'live'
    ), '[]'::jsonb),
    'missing', public.book_missing(s.id)
  )
  from public.shops s
  join public.shop_books b on b.shop_id = s.id and b.status = 'live'
  where s.slug = p_slug;
$$;

revoke all on function public.book_public(text) from public;
grant execute on function public.book_public(text) to anon, authenticated;

-- Remove a page: the verified owner at any time, the contributor within 24 hours.
-- Returns the storage path so the server can delete the file.
create or replace function public.book_remove_page(p_page_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.shop_book_pages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_page from public.shop_book_pages where id = p_page_id and status = 'live' for update;
  if not found then
    raise exception 'not_found';
  end if;

  if not (
    public.is_verified_owner(v_page.shop_id)
    or (v_page.contributed_by = auth.uid() and v_page.created_at > now() - interval '24 hours')
  ) then
    raise exception 'not_allowed';
  end if;

  update public.shop_book_pages
  set status = 'removed', removed_at = now(), removed_by = auth.uid()
  where id = p_page_id;

  return v_page.image_path;
end;
$$;

revoke all on function public.book_remove_page(uuid) from public, anon;
grant execute on function public.book_remove_page(uuid) to authenticated;

-- Owner fixes the hours the AI read, or hides the whole book.
create or replace function public.book_owner_update(
  p_shop_id uuid,
  p_hours jsonb default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not public.is_verified_owner(p_shop_id) then
    raise exception 'not_allowed';
  end if;
  if p_status is not null and p_status not in ('live', 'hidden') then
    raise exception 'bad_status';
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'object' or pg_column_size(p_hours) > 4096) then
    raise exception 'bad_hours';
  end if;

  update public.shop_books
  set hours = coalesce(p_hours, hours),
      status = coalesce(p_status, status),
      updated_at = now()
  where shop_id = p_shop_id;

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.book_owner_update(uuid, jsonb, text) from public, anon;
grant execute on function public.book_owner_update(uuid, jsonb, text) to authenticated;
```

Migration test (vitest, text only, no database): the file contains `enable row level security` three times; no `service_role`; no insert, update or delete policy on the three tables; `book_remove_page` and `book_owner_update` are revoked from anon; the storage bucket has no insert policy.

## 3. API shape (server routes, signed-in user via the SSR client; writes use the server-only service client)
- `GET /api/book/{slug}?lang=th`: calls `book_public`. If `lang` equals `source_language` or is missing, return as stored. Otherwise return stored pages immediately merged with cached translations, plus `translation: {pending: [pageIds]}`; the client then calls the translate route. Response shape: `{shop, book, pages[], missing[], lang, translation}`. Public, read-only, cacheable for 60 s. This is also the first shape of the "agent-ready" read-only API: documented in `docs/API.md`, wording "agent-ready", never "works with Muse".
- `GET /api/book/missing?shop={slug}`: `{missing: ["storefront","menu"]}` via `book_missing`.
- `POST /api/book/pages` (multipart: `shop` slug, `kind`, `files[1..8]`): auth required (401 `not_signed_in`), rate limit (429 `rate_limited`), validate size and type (400 `bad_image`, 413 `too_big`), caps (409 `page_limit`, 409 `already_there` for single kinds), blur every image (fail closed, 422 `blur_failed`), upload to `shop-book/{shopId}/{uuid}.jpg`, then ONE Muse Spark call for the whole upload (see 4), write the page rows with `ai_meta`, upsert the `shop_books` row (first upload creates it), refresh the theme (5), return `{pages, missing, ai: {model, latency_ms, images_in_call}}`.
- `POST /api/book/translate` body `{shop, lang}`: finds live pages with no cache row (or a stale `source_hash`) for that language, sends ALL of them in ONE Muse Spark text call, stores rows in `shop_book_translations`, returns them. Rate limited with the `snap` bucket. A second viewer in the same language costs zero AI calls.
- `POST /api/book/retry` body `{shop}`: re-reads live pages whose `extracted` is empty (used after `ai_resting`).
- `POST /api/book/pages/{id}/remove`: calls `book_remove_page`, then deletes the storage object with the service client.
- `POST /api/book/owner` body `{shop, hours?, status?}`: calls `book_owner_update`.

## 4. Muse Spark calls (use the same Meta client as the matcher; Grok to inspect it; model id comes from the response, never hardcoded in the panel)
A) Menu and board reading, one call per upload, N images in one request (up to 8). Ask for JSON only:
`{pages:[{index, kind_guess, is_menu, language, section, items:[{name, price, currency, note}] , hours?:{days:[{d,open,close}], raw}}], shop_language, tagline_facts:[...]}`.
Rules in the prompt: copy text exactly as seen, price as printed, `null` when unreadable, no invented items. Server validates the JSON (zod or hand check), drops any page whose `is_menu` is false when kind was `menu` (409 `not_a_menu`, image removed), and caps items at 150 per page.
SPIKE FIRST (one try, rule 1): Grok sends 2 test images in one request to the Meta Model API to confirm multi-image input works and the per-request image limit. If more than one image is rejected or the limit is below 8, use chunks of the largest size that works, say so in the report, and keep the code path "one call per chunk". Do not fake batching.
B) Translation, one call per (shop, language) for all missing pages: input the `extracted` objects, output the same shape; names get "translated name" and keep the original in `name_original`; prices, currencies and numbers are copied byte for byte (server re-checks this and rejects the translation if any price changed).
C) Cover: no extra call. The tagline and hours come from A. If A found hours, fill `shop_books.hours` as `{days:[...], raw, source:"photo"}`.

## 5. Palette and theme (code, not AI)
`lib/book/palette.ts` (pure): from the storefront and logo image, sharp downsizes to 64 px, quantizes to 5 swatches, picks `accent` = the most saturated swatch that has contrast ratio at least 4.5 against the dark surface `--color-surface-1`, else falls back to the Prox accent. Stores `{swatches:[hex x5], accent, ink}` in `shop_books.theme`. The book viewer applies it only as CSS variables inside its own container (cover gradient, dots, chips). The app's dark theme and its contrast stay as they are. Never write theme text colors that fail 4.5:1.

## 6. UI screens (dark theme tokens, 44 px targets, en and th for every string)
- S1 Success pill on the post-success screen: "Keep seeding {shop}?" with a count "3 things missing".
- S2 Seed checklist (Snap in seed mode): header with the shop name and a thin progress bar; tiles for what is missing only; empty state "Complete". No form fields.
- S3 Upload menu sheet: thumbnails of picked pages, "Add another page", one button "Read the menu". While it runs: "Reading 5 pages in one go" (names the step, not a silent wait). Done: "5 pages, 43 items found" and the book opens at the first menu slide.
- S4 Book viewer `/book/{slug}`: full-height swipe slides (CSS scroll-snap), dots plus counter. Slide 1 Cover: name, local name, tagline, hours under the name with "Open now / Closed, opens 08:00" from `lib/book/hours.ts` (pure, uses shop timezone), palette bar, "Photos by {names}". Next slides: storefront, hours board, one slide per menu page (items in a clean list; price right aligned, tabular), logo in the cover corner and on its own slide, QR slide with "Scan at the counter" caption only (v1 does not decode QR or open any link). Language chip row: `EN | ไทย | Original` (viewer language first). A small "Translating..." shimmer on text while the translate route runs; the original shows first.
- S5 Owner and claim: unclaimed banner "Your page is already built. Claim it"; verified owner "Edit" mode shows Remove on each slide and "Fix hours" (simple day rows, no typing of JSON), "Hide book". Photographer credit on every slide.
- S6 Nudges: "Upload menu" button on place sheet and shop page when missing includes `menu`; "Build its page" chip when no book exists.
- Report slot on each slide: a disabled-looking text "Report" is NOT allowed; leave no dead control. Render nothing until step 3 wires it.

## 7. Error states
- Meta 429, 402 or timeout (any non-2xx from Meta): `ai_resting`. The images are already blurred and stored, the pages are saved with empty `extracted`, and the UI says "The AI is resting. Your photos are saved. Open the book in a minute and tap Read again." The book viewer shows image-only slides with a "Read this menu again" button that calls `/api/book/retry`. Never lose the upload, never crash. Test it.
- Others: `not_signed_in` (sign-in prompt, keep the picked photos), `rate_limited` (friendly text), `bad_image`, `too_big`, `page_limit`, `already_there` (the tile should not have been shown; refresh missing), `not_a_menu` ("That does not look like a menu. Try again."), `blur_failed` ("We could not check this photo for faces. Please retake it."), `upload_failed`.
- Translation failure: show the original with "Could not translate right now". Never block the book.

## 8. Behind the scenes hooks (judge-visible, only when the panel is on per step 1 F4)
Every book page stores `ai_meta` from the real call. On the book viewer a "How this page was built" chip opens a strip with: model id returned by Meta, images in the call (for example "5 images, 1 call"), latency, items read, source and viewer language, translation cache hit or miss per language and the number of Meta calls it cost (0 on a hit), faces blurred. Read from stored `ai_meta` and the API responses, never hardcoded. Truth rule from judge-v1 applies.

## 9. Tests (vitest, no network)
- `lib/book/palette.test.ts`: accent contrast at least 4.5 on dark; fallback when swatches are dull; deterministic.
- `lib/book/hours.test.ts`: open now, closed, overnight hours, shop timezone, missing hours.
- `lib/book/schema.test.ts`: the Meta response validator accepts good JSON, rejects invented keys, caps items, handles null prices.
- Route tests with a mocked Meta client and mocked Supabase: success, one Meta call for a 5-image upload, chunk fallback, 401, 429 rate limit, `already_there`, `page_limit`, `not_a_menu`, `blur_failed` (nothing stored), `ai_resting` (images stored, pages saved, friendly message), translation cache hit (zero Meta calls), price changed in translation (rejected), cache keyed by language and source hash.
- `book_missing` logic mirrored in a pure TS helper if the app computes it too; test it per category.
- Migration text test (section 2). Copy parity test stays green. A test that the book route and page never import a service-role key in client code.
- The audit test from judge-v1 stays green (no files under public/ without an entry).

## 10. Acceptance
- A signed-in person can: post a snap, tap "Keep seeding", add a storefront, a logo, and a 4-page menu in one go, and see the tiles disappear; open `/book/{slug}`; change language to Thai or English and see the translated items, with the second view served from cache.
- The multi-page menu used ONE Meta call (or the documented chunk count), proven by `ai_meta` and a test.
- No face survives in any stored book image; a Meta outage never loses an upload.
- An unclaimed shop shows "Your page is already built. Claim it"; a verified owner can remove a page and fix hours; a stranger cannot (tested).
- `npm test` and `npm run build` pass. Report: branch, commits, test count, files changed, the Meta multi-image spike result, open questions. Suggested branch `feat/shop-book-v1`; no push.

## 11. Cut for v1 (do not build)
Automatic logo cleaning or background removal (stretch only, and it must crop the real photo, never redraw); any logo generation; drag-to-reorder; photos per dish; QR decoding or opening links; ordering, payments or delivery; per-day owner text editing beyond hours; page version history; PDF or print export; voice; translation of owner-written text (there is none); more than one language detected per page; push or email nudges; a public sitemap.

## 12. Build slices (so each Grok prompt fits 25 tool calls)
2a: migration file, types, Meta spike, `POST /api/book/pages` for storefront, logo, hours and menu, palette, blur-then-store, tests. 
2b: seed checklist in Snap, success pill, upload menu sheet, book viewer without translation, nudges. 
2c: translation route and cache, language chips, owner and claim, Behind-the-scenes chip, error states polish, README and docs/API.md.
