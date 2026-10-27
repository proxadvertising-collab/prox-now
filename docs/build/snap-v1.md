# Snap v1: camera, resize, Spark shop match, confirm or pick

Written for Grok Build. Source of truth for the mission. Existing code to reuse: lib/copy.ts (snap.*, reading.*, confirm.*, loc.*, err.* keys), lib/geo.ts, lib/fixtures/shops.ts, components/ui/*, lib/freshness.ts. No database calls in this task. No new dependencies.

## 1. Server Meta client: lib/ai/meta.ts (server only, `import "server-only"` is NOT installed, so just never import it from client code)
- `callSpark({ prompt, imageDataUrl })` uses fetch to POST https://api.meta.ai/v1/responses with header Authorization: Bearer ${process.env.META_API_KEY}. Body: {"model":"muse-spark-1.3","reasoning":{"effort":"minimal"},"max_output_tokens":2500,"input":[{"role":"user","content":[{"type":"input_text","text":PROMPT},{"type":"input_image","image_url":DATA_URL}]}]}. Send `store:false`. Never use previous_response_id.
- Parse: concatenate the `text` of every item with type "output_text" inside output[].content[]. Strip ``` fences, JSON.parse. Return { raw, usage, ms }.
- If META_API_KEY is missing throw a typed error MetaKeyMissing. Never log or return the key or request headers. Timeout 25 s with AbortController. Map HTTP 401/403 to "auth", 429 to "busy", others to "upstream", and never include the response body in what the browser sees.

## 2. Matcher: lib/ai/matcher.ts (pure, no network)
- `buildMatcherPrompt({ areaLabel, candidates })`: candidate = { id, nameLocal, name, category, distanceM }. Candidate lines are `- {id} | {nameLocal or name} | {name} | {category} | ~{distanceM} m from the GPS fix`. Fill {CL} in the template below and {AREA} with areaLabel (for the demo: "Soi 102, Hua Hin, Thailand"). Keep the template text otherwise exactly as written, it was tuned on real photos.
- `parseMatcherResult(unknown)`: validates and normalises into `MatcherResult` { shopId: string|null, confidence 0..1, signText: {original, translated}[] (max 6), qualityScore 0..10, qualityReason, faces: number[4][] clamped to 0..1, category, safeToPost: boolean, safeReason }. Anything malformed becomes a safe default (shopId null, confidence 0). If shopId is not in the candidate ids, force null. If shopId is null, confidence is 0.
- `decide(result)`: returns "confirm" when shopId non-null and confidence >= 0.8, "pick" when shopId non-null and confidence < 0.8 (show it first in the list, marked as best guess), "pick-all" when shopId is null.
- `selectCandidates(point, shops, {radiusM = 500, max = 10})`: nearest shops by haversine within radius; if none (demo mode, user far away), use the nearest 10 measured from DEMO_CENTER and set `demo: true`.

Matcher prompt template ({AREA} and {CL} are the only placeholders; the shop-name rules about Thai spelling must stay):
```
Task: match a customer's photo to ONE shop from a candidate list, for a map app in {AREA}.
Candidates (id | Thai name | English name | category | GPS distance):
{CL}

Method (do it silently): 1) Read all visible text (Thai, English, Chinese, phone numbers, menus). 2) Compare the shop NAME on the sign/menu/flyer to candidate names, tolerating transliteration/spelling variants of the SAME name (e.g. Mala/หม่าล่า) but NOT different names: if even one Thai word or syllable differs (e.g. แม่เย็น vs แม่ยิ้ม), they are different shops. Name text is the strongest evidence, then the type of goods shown, then GPS distance (weak tie-breaker only). 3) If no candidate clearly matches, shop_id must be null - never force a match; a shop that is not in the list should give null.
Confidence guide: 0.9+ name text clearly matches; 0.6-0.89 type/visual match without readable name; <0.5 guess.

Output ONLY this JSON (no markdown fences, no prose):
{"shop_id":"sNN or null","confidence":0.0,"sign_text":[{"thai":"original text","english":"translation"}],"quality_score":0,"quality_reason":"one line","faces":[[x1,y1,x2,y2]],"category":"","safe_to_post":true,"safe_reason":""}
Rules: sign_text lists the 1-6 most important text items (shop name, menu items, prices) with Thai-to-English translation (english may equal the text if already English). quality_score is 0-10 for how useful the photo is as a public map photo (sharp, well-framed, readable, well lit). faces = normalized [x1,y1,x2,y2] boxes (0-1, origin top-left) for every human face visible including partial/small/stylized-photo faces, else []. safe_to_post=false if clear identifiable faces of real people, minors, license plates, nudity, ID/cards, or private info are visible; illustrated cartoon faces on a sign are fine.
Extra rules: (a) If the sign's name text is clearly readable but equals no candidate, shop_id=null and put the name you read in sign_text. (b) If the image is a screenshot, photo of a screen, or not a shop/stall/menu, shop_id=null, quality_score<=2. (c) If the image is too blurry/dark to read, shop_id=null and say why in quality_reason. (d) "confidence" is your confidence in shop_id; when shop_id is null set confidence to 0. (e) Real photographs of people's faces count in faces; printed drawings, mascots or cartoons on signs do not (mention in safe_reason). Keep sign_text to at most 6 short items.
```
(Note: the template as tuned says "for a map app in Hua Hin, Thailand (Soi 102)"; it is replaced by {AREA} above. Keep every other word.)

## 3. Route: app/api/analyze/route.ts
- POST multipart/form-data: `image` (File, jpeg or png or webp, max 3 MB), `lat`, `lng` (numbers, optional). Validate everything, reject with 400 and a plain error code (no stack traces).
- export const runtime = "nodejs"; export const maxDuration = 60; preferredRegion is already set by the project (sin1), do not change vercel config.
- Flow: read file, base64 data URL, selectCandidates, buildMatcherPrompt, callSpark, parseMatcherResult, decide. Response JSON: { decision, result, candidates: [{id, name, nameLocal, distanceM}], demo, ms }. The photo is never stored. Return 503 { error: "ai_not_configured" } when the key is missing.
- Tests with vitest and a mocked global fetch (no network): missing key gives 503; a fenced JSON answer is parsed; malformed output becomes pick-all; shopId outside the candidate list becomes null; oversize file gives 400.

## 4. Phone side
- lib/image/resize.ts: `resizeToJpeg(file, maxEdge = 1024, quality = 0.8)` using createImageBitmap with imageOrientation "from-image", an OffscreenCanvas or a normal canvas, returning a Blob. Pure helper `fitWithin(w, h, maxEdge)` is unit tested.
- app/(app)/snap/page.tsx and a client component components/snap/SnapFlow.tsx. States: idle, reading, confirm, pick, error. Use DESIGN.md section 9 copy keys (snap.cta, reading.*, confirm.*, err.*) and SCREENS.md for layout; if a key is missing add it in en and th and keep the parity test green.
  - Idle: big primary "Snap a shop" button that opens the camera through `<input type="file" accept="image/*" capture="environment">` (works on iPhone Safari and Android; no getUserMedia).
  - On photo: show the photo preview immediately, ask for location only now (navigator.geolocation, 8 s timeout; failure or denial falls back to demo location and shows the demo notice), resize, POST to /api/analyze, show a "Reading the shop…" state with the elapsed seconds (aria-live polite).
  - confirm: card with the photo, "Is this <shop name>?" Yes / "Not this one". Not this one goes to pick.
  - pick: a short list of the candidates (best guess first) plus "None of these". Tap selects.
  - After the shop is chosen: show a success screen "Pin ready for <shop>" with the total seconds from tap to result, and a note "Demo: not posted yet". No database write. A "Snap another" button resets.
  - Errors: plain words, retry button, never a dead end. A 503 ai_not_configured shows "The shop reader is offline." 
- Protected-route rules: /snap is currently behind sign-in in the proxy. For this task make /snap public until the database exists (remove it from the protected list in lib/supabase/session.ts, keep /wallet and /inbox) and update the session test.

## 5. Tests and docs
- Vitest, no network: matcher (prompt contains each candidate id, {CL} and {AREA} fully replaced, no leftover braces), parseMatcherResult cases, decide thresholds 0.8, selectCandidates radius and demo fallback, fitWithin, route tests above. Existing 36 tests stay green.
- scripts/analyze-smoke.mjs: reads a local image path from argv and calls http://localhost:3000/api/analyze with lat 12.5685, lng 99.9575, prints decision, shop, confidence, ms. No keys in the script.
- README: short "Snap pipeline" section (what it does, that photos are not stored, env var META_API_KEY by name only).
