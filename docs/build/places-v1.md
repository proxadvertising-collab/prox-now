# Places v1: worldwide-ready places and an open-format export ("places no map had")

Written for Grok Build. Source of truth for the mission. Reuse: lib/shops/source.ts, lib/supabase/*, lib/geo/*, lib/copy.ts (en + th, parity test stays green), app/api/*. Migrations are files only (next number: 0004), and only if truly needed.

## Why
Prox Now is a live layer ("what is happening at this shop right now") plus a place seeder: people add small shops that map data lacks. Meta's own maps use Overture Maps place data, so we export what people add in Overture-style records. We never claim to replace Meta's map.

## 1. Worldwide fields on every new shop (no hard-coded Thailand)
- When a shop is created from a snap or Add this shop, make sure country_code (ISO 3166-1 alpha-2), timezone (IANA) and currency (ISO 4217) are never silently Thai. Order of truth: country_code from the request header x-vercel-ip-country when present (the person is at the shop), else null; timezone from the browser (Intl.DateTimeFormat().resolvedOptions().timeZone) sent by the client and validated against Intl.supportedValuesOf("timeZone"); currency from a small tested table of country to currency (cover at least 40 common countries, default null, never a guess).
- Check supabase/migrations/0002_user_shops.sql first. If create_shop_from_snap already accepts these as parameters, only change the client and route. If it hard-codes values or lacks parameters, add supabase/migrations/0004_shop_worldwide_fields.sql (file only, never applied) that replaces the function with the extra optional parameters. Header says: apply only after the captain writes apply.
- Unit tests for the country-to-currency table, timezone validation, and header parsing.

## 2. Open-format export
- GET /api/places/export (public, no auth, cached 5 minutes): GeoJSON FeatureCollection of shops where created_by is not null (never demo or seed shops). Each Feature: geometry Point [lng, lat]; properties: id (shop uuid), names { primary: name, common: { <lang>: name_local } when present }, categories { primary: category }, addresses [{ country: country_code, freeform: address_hint }] when present, phones [phone_public] when present, sources [{ property: "", dataset: "prox-now", record_id: uuid, update_time: ISO created_at }], confidence: 0.6 as a constant with a comment that it is user reported, plus prox_now: { timezone, currency, claimed }.
- Never include created_by, emails, or any user id. Test that those never appear. Cap at 5000 features, order by created_at desc, support ?country=XX and ?since=ISO.
- Pure function lib/places/overture.ts toOverturePlace(shopRow) with tests (full row, minimal row, missing local name, no phone).

## 3. Seeding stats
- GET /api/places/stats: { placesAdded, countries (distinct count), momentsSeeded (posts all-time, including expired), liveNow }. Public, cached 60 s, computed with one SQL query via the server client; fixtures fallback returns zeros.
- Map header shows a small line "123 places added in 4 countries" (hide when 0). Add en and th copy keys, parity green.

## 4. README and report
- README section "Places": what the export contains and does not, and the plain statement that Prox Now adds a live layer and seeds missing places; it does not replace any map.
- Tests green (92 existing stay green), npm run build passes, no push unless the prompt says so. Report: branch feat/places-v1, commits, test count, files, open questions, and "0004 is only a file until the captain writes apply" if a migration was needed.
