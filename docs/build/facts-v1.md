# Facts v1: read more facts from one photo, save them, show them in the viewer's language

Written for Grok Build. Source of truth. Reuse: lib/ai/meta.ts, lib/ai/matcher.ts (buildMatcherPrompt, parseMatcherResult), app/api/analyze, app/api/posts/route.ts, lib/posts/source.ts, components/snap/SnapFlow.tsx, components/map/* (sheet), lib/copy.ts (en + th, parity green), lib/places/*. Migrations are files only (next number: 0005).

## Principles
- One model call per photo (do not add a second call). Facts are about the PLACE and the MOMENT, never about people. Never identify anyone, never describe a person's appearance beyond "crowd level".
- Everything is optional: missing or malformed facts are dropped, never invented. Prices are only kept when clearly readable on a sign or board.
- Original photo is still never stored; only the blurred JPEG.

## 1. Extend the matcher result (lib/ai/matcher.ts) with a `facts` object
{ caption: string max 140 chars describing what is shown or sold (no people); items: [{ name, price (number|null), currency (ISO 4217|null) }] max 8; crowd: "empty"|"few"|"busy"|"queue"|null; open_status: "open"|"closed"|"unknown"; signals: array of up to 5 from ["fresh_batch","promo","sold_out","event","music","new_item"]; sign_language: BCP-47 tag|null; captions: { en: string, th: string } (the caption in English and Thai; add the viewer-language keys later) }.
- Update buildMatcherPrompt to ask for it in the same JSON, with the instruction to leave a field null when unsure. parseMatcherResult validates and clamps every field (strings trimmed, lengths capped, enums checked, prices finite and 0..1e6, currency matched /^[A-Z]{3}$/). Old results without facts still parse (facts = null). Tests: valid, partial, garbage, missing, oversized.

## 2. Save facts (migration + route)
- supabase/migrations/0005_post_facts.sql (file only): add `facts jsonb` to public.posts (default null, check jsonb_typeof = 'object' when not null, pg_column_size <= 4096); replace create_post with an extra optional parameter p_facts jsonb default null (same rules as before, fail the same errors; drop the old signature first and keep grants authenticated only). Header: apply only after the captain writes apply.
- app/api/posts/route.ts: pass the validated facts from the same Spark call into create_post; if the migration is not applied yet the route must still work by retrying without p_facts only when the error is "function not found" (log once). Tests for both paths.

## 3. Viewer language
- lib/i18n/viewer.ts: pickLanguage(accept-language header | navigator.languages, supported = ["en","th"]) returns the best supported language, default "en". Settings toggle already planned; add a small language switch to the map sheet header only if cheap (otherwise leave).
- Sheet shows captions[viewerLang] if present, else captions.en, else the original sign text. Items show as "Name  price currency" formatted with Intl.NumberFormat using the item's own currency. If sign_language differs from the viewer's language show a small "Translated from <language name via Intl.DisplayNames>" note.
- Pure helpers with tests: pickLanguage, formatItemPrice, chooseCaption.

## 4. UI: facts and the honest line
- Map sheet: caption, up to 3 item chips with prices, crowd chip, open chip, and signal chips, all in copy keys (en + th). Hide anything null. Dark mode, 44 px targets.
- Snap post step: show the plain sentence above the Post button: "Your photo helps keep this map fresh. Faces are blurred and only the blurred photo is kept." (en and th).
- Add a `Delete my post` action for the author on their own live post (calls a server route that deletes the row and the storage object with the user session); tests for authorization (not the author gets 403).

## 5. Tests, docs, report
- Existing 105 tests stay green; build passes; README section "What we read from a photo" listing the facts and what is never read or stored. No push. Branch feat/facts-v1 from main. Commit by explicit path after each section. Report: commits, test count, files, open questions, and "0005 is only a file until the captain writes apply."
