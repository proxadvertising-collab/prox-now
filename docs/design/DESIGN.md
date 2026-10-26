# Prox Now — Design System (v1, mobile-first, dark by default)

Tagline: **Prox Now makes your street wonder-full.** Never use "Pokémon Go" wording anywhere (UI, docs, README).
Audience: real people on a street, one hand, bright sun or night, often in Thai, often judging from another country. Every choice below has to be **appealing and effective**: clear, fast, delightful, accessible.

## 1. Principles
1. **One thumb, one job.** Each screen has one obvious primary action in the bottom third.
2. **Show time, not tech.** The star of every pin is "how long is this still open to see". Countdown beats metadata.
3. **Warm night market.** Dark warm-charcoal canvas, one lantern-orange accent. Never cold blue-black, never neon soup.
4. **Fast feels friendly.** Show something within 100 ms; never a blank screen. Optimistic UI, skeletons, progress that names the step.
5. **Never trap, never shame.** Every error says what happened + one thing to do. Denied permission always has a way forward.
6. **Redundant cues.** Never colour alone: pair colour with text, shape or ring length (colour-blind and sunlight safe).
7. **Respect the shop and the face.** Faces blurred, owner decides (Keep/Pass), photographer credited. Say so in the UI.
8. **Bilingual by default.** English + Thai everywhere; Thai gets room (taller lines, no clipped marks).

## 2. Colour (CSS variables, exact hex)
Base is `#0F0D0C` (warm, not pure black: less glare, avoids OLED smear, keeps the accent glowing).

| Token (Tailwind utility) | Hex | Use |
|---|---|---|
| `--color-bg` (`bg-bg`) | `#0F0D0C` | page |
| `--color-surface-1` | `#181513` | cards |
| `--color-surface-2` | `#211D1A` | sheets, nav, modals |
| `--color-surface-3` | `#2B2621` | inputs, pressed |
| `--color-border` | `#3B342E` | decorative dividers only |
| `--color-border-strong` | `#7A6F64` | input outlines (3:1 UI contrast) |
| `--color-fg` (`text-fg`) | `#F7F0E8` | primary text |
| `--color-fg-muted` | `#BDB2A6` | secondary text |
| `--color-fg-subtle` | `#A39888` | hints, timestamps, placeholders |
| `--color-accent` | `#FF8A3D` | lantern orange: primary buttons, fresh pins, focus ring, links |
| `--color-accent-pressed` | `#E8701F` | pressed primary |
| `--color-accent-ink` | `#1C0E05` | text on accent |
| `--color-accent-soft` | `#33200F` | accent tint backgrounds |
| `--color-success` / `-soft` | `#5BD18B` / `#12261B` | coupon ready, kept |
| `--color-warning` / `-soft` | `#FFD166` / `#2E2508` | heads-up, last minutes copy |
| `--color-danger` / `-soft` | `#FF6B6B` / `#2E1414` | errors, Pass confirm, last-10-min pin text |
| `--color-info` / `-soft` | `#7DB8FF` / `#111F30` | **Demo mode** banner, neutral info |
| `--color-ink` | `#0F0D0C` | text on success/warning/danger buttons |
| `--color-pin-aging` | `#C99A4E` | pin, 10–60 min left (the lantern dims) |
| `--color-pin-last` | `#FF5D5D` | pin, under 10 min |

Photo overlays use a scrim `linear-gradient(to top, rgb(15 13 12 / .92), transparent)` under any text on photos.

### 2.1 WCAG AA check (computed by `design/contrast-check.py`, re-run after any colour change)
Text needs 4.5:1; UI components, ring and pins need 3:1. Result: **46/46 pass.**

| Foreground | Background | Ratio | Needs | Result | Used for |
|---|---|---|---|---|---|
| `fg` #F7F0E8 | `bg` #0F0D0C | 17.16:1 | 4.5:1 | PASS | Body text on page |
| `fg` #F7F0E8 | `surface-1` #181513 | 16.08:1 | 4.5:1 | PASS | Body text on cards |
| `fg` #F7F0E8 | `surface-2` #211D1A | 14.80:1 | 4.5:1 | PASS | Body text on sheets |
| `fg` #F7F0E8 | `surface-3` #2B2621 | 13.26:1 | 4.5:1 | PASS | Body text in inputs / pressed |
| `fg-muted` #BDB2A6 | `bg` #0F0D0C | 9.31:1 | 4.5:1 | PASS | Secondary text on page |
| `fg-muted` #BDB2A6 | `surface-1` #181513 | 8.73:1 | 4.5:1 | PASS | Secondary text on cards |
| `fg-muted` #BDB2A6 | `surface-2` #211D1A | 8.03:1 | 4.5:1 | PASS | Secondary text on sheets |
| `fg-muted` #BDB2A6 | `surface-3` #2B2621 | 7.19:1 | 4.5:1 | PASS | Secondary text in inputs |
| `fg-subtle` #A39888 | `bg` #0F0D0C | 6.84:1 | 4.5:1 | PASS | Hints, timestamps on page |
| `fg-subtle` #A39888 | `surface-1` #181513 | 6.41:1 | 4.5:1 | PASS | Hints on cards |
| `fg-subtle` #A39888 | `surface-2` #211D1A | 5.90:1 | 4.5:1 | PASS | Hints on sheets |
| `fg-subtle` #A39888 | `surface-3` #2B2621 | 5.28:1 | 4.5:1 | PASS | Placeholder in inputs |
| `accent` #FF8A3D | `bg` #0F0D0C | 8.27:1 | 4.5:1 | PASS | Accent as text / link on page |
| `accent` #FF8A3D | `surface-1` #181513 | 7.75:1 | 4.5:1 | PASS | Accent as text on cards |
| `accent` #FF8A3D | `surface-2` #211D1A | 7.13:1 | 4.5:1 | PASS | Accent as text on sheets |
| `accent-ink` #1C0E05 | `accent` #FF8A3D | 8.04:1 | 4.5:1 | PASS | Label on primary button |
| `accent-ink` #1C0E05 | `accent-pressed` #E8701F | 6.07:1 | 4.5:1 | PASS | Label on pressed primary button |
| `accent` #FF8A3D | `accent-soft` #33200F | 6.61:1 | 4.5:1 | PASS | Accent text on accent tint |
| `success` #5BD18B | `bg` #0F0D0C | 10.10:1 | 4.5:1 | PASS | Success text on page |
| `success` #5BD18B | `success-soft` #12261B | 8.29:1 | 4.5:1 | PASS | Success text on success banner |
| `warning` #FFD166 | `bg` #0F0D0C | 13.45:1 | 4.5:1 | PASS | Warning text on page |
| `warning` #FFD166 | `warning-soft` #2E2508 | 10.52:1 | 4.5:1 | PASS | Warning text on warning banner |
| `danger` #FF6B6B | `bg` #0F0D0C | 6.99:1 | 4.5:1 | PASS | Danger text on page |
| `danger` #FF6B6B | `danger-soft` #2E1414 | 6.17:1 | 4.5:1 | PASS | Danger text on danger banner |
| `danger` #FF6B6B | `surface-2` #211D1A | 6.03:1 | 4.5:1 | PASS | Danger text on sheets |
| `info` #7DB8FF | `bg` #0F0D0C | 9.39:1 | 4.5:1 | PASS | Info / demo text on page |
| `info` #7DB8FF | `info-soft` #111F30 | 8.06:1 | 4.5:1 | PASS | Demo banner text |
| `ink` #0F0D0C | `success` #5BD18B | 10.10:1 | 4.5:1 | PASS | Label on success button |
| `ink` #0F0D0C | `warning` #FFD166 | 13.45:1 | 4.5:1 | PASS | Label on warning button |
| `ink` #0F0D0C | `danger` #FF6B6B | 6.99:1 | 4.5:1 | PASS | Label on danger button |
| `border-strong` #7A6F64 | `bg` #0F0D0C | 3.96:1 | 3.0:1 | PASS | Input outline vs page (UI component, 3:1) |
| `border-strong` #7A6F64 | `surface-1` #181513 | 3.71:1 | 3.0:1 | PASS | Input outline vs card (3:1) |
| `border-strong` #7A6F64 | `surface-2` #211D1A | 3.41:1 | 3.0:1 | PASS | Input outline vs sheet (3:1) |
| `accent` #FF8A3D | `surface-2` #211D1A | 7.13:1 | 3.0:1 | PASS | Focus ring / ring track vs sheet (3:1) |
| `accent` #FF8A3D | `map-bg` #0E0C0B | 8.32:1 | 3.0:1 | PASS | Fresh pin vs map (3:1) |
| `pin-aging` #C99A4E | `map-bg` #0E0C0B | 7.63:1 | 3.0:1 | PASS | Aging pin vs map (3:1) |
| `pin-last` #FF5D5D | `map-bg` #0E0C0B | 6.48:1 | 3.0:1 | PASS | Last-10-min pin vs map (3:1) |
| `pin-last` #FF5D5D | `map-road` #2B2623 | 4.97:1 | 3.0:1 | PASS | Last-10-min pin over a road (3:1) |
| `accent` #FF8A3D | `map-road` #2B2623 | 6.38:1 | 3.0:1 | PASS | Fresh pin over a road (3:1) |
| `map-label` #9E948A | `map-bg` #0E0C0B | 6.56:1 | 4.5:1 | PASS | Map street labels after our override |
| `map-label` #9E948A | `map-water` #12171B | 6.06:1 | 4.5:1 | PASS | Map labels over water |
| `map-label` #9E948A | `map-park` #14170F | 6.09:1 | 4.5:1 | PASS | Map labels over parks |
| `pin-aging` #C99A4E | `map-road` #2B2623 | 5.85:1 | 3.0:1 | PASS | Aging pin over a road (3:1) |
| `pin-last` #FF5D5D | `map-water` #12171B | 5.99:1 | 3.0:1 | PASS | Last-10-min pin over water (3:1) |
| `accent` #FF8A3D | `map-park` #14170F | 7.72:1 | 3.0:1 | PASS | Fresh pin over a park (3:1) |
| `fg` #F7F0E8 | `map-bg` #0E0C0B | 17.27:1 | 4.5:1 | PASS | Pin label text on map |

Rules that follow: accent is allowed as text on all dark surfaces; **never** put white text on accent (use `accent-ink`); never use `border` for input outlines (use `border-strong`); `fg-subtle` is the lowest allowed text colour; don't go below 12 px.

## 3. Typography (Thai-capable)
- **Latin: Plus Jakarta Sans** (variable, friendly geometric, great numerals) via `next/font/google`, subsets `latin`.
- **Thai: Noto Sans Thai** (variable) via `next/font/google`, subset `thai`. Browsers fall back per glyph, so Thai text uses Noto and Latin uses Jakarta inside the same string.
- Stack: `var(--font-latin), var(--font-thai), ui-sans-serif, system-ui, sans-serif`. Use `display: "swap"`. Two variable files keep payload small. Set `<html lang>` to `en` or `th` (drives line-height below and screen readers).
- Numbers that tick (countdown, minutes): `font-variant-numeric: tabular-nums`.
- Inputs are **16 px minimum** (iOS Safari zooms the page on focus below 16 px).

| Style | Size / line | Weight | Use |
|---|---|---|---|
| display | 34 / 1.15 | 800 | splash, coupon "Nice shot!" |
| title | 24 / 1.25 | 700 | screen titles |
| heading | 18 / 1.35 | 700 | card titles, shop name |
| body | 16 / 1.5 | 500 | default |
| label | 14 / 1.4 | 600 | buttons, chips |
| caption | 12 / 1.4 | 500 | metadata (never smaller) |
| timer | 40 / 1 | 800 tabular | big countdown number |

Thai needs more air: `:lang(th)` adds `line-height: +0.15` (body 1.65) and never uses line-height under 1.3, or tone marks and vowels clip. Don't letter-space Thai. Don't uppercase Latin button labels (hurts mixed-language rows); use sentence case.

## 4. Space, radius, elevation
- **Spacing**: 4 px base. Scale 4, 8, 12, 16, 20, 24, 32, 48. Screen padding 16. Card padding 16. Gap between stacked cards 12.
- **Radius**: sm 8 (chips), md 12 (inputs), lg 16 (cards), xl 24 (sheets, top corners), full (buttons, pins, FAB). Buttons are pills: friendly and thumb-shaped.
- **Elevation in dark mode** = lighter surface + soft shadow + hairline. `shadow-card`: `0 1px 0 rgb(255 255 255 / .04) inset, 0 8px 24px rgb(0 0 0 / .35)`. `shadow-sheet`: `0 -12px 40px rgb(0 0 0 / .5)`. `shadow-glow` (fresh pins, primary snap button): `0 0 0 6px rgb(255 138 61 / .18), 0 8px 28px rgb(255 138 61 / .35)`.

## 5. Layout and thumb zone
- Mobile first. App column max 480 px, centred, on desktop; the **Shop Inbox** is the exception and may use up to 960 px (laptop).
- Height: `min-h-dvh` (never `100vh`). Pad with `env(safe-area-inset-*)`.
- **Bottom nav** (mobile): 64 px + safe-area bottom, `surface-2`, 5 slots: Map · Wallet · **Snap** · Shop · You. Snap is a raised 72 px accent circle (glow) overlapping the bar by 16 px. Labels always visible (12 px caption); active item = accent icon + 3 px accent dot, not colour alone.
- Hit targets **≥ 44×44 px**, ≥ 8 px apart. Primary buttons 56 px tall, full width minus 16 px margins.
- Primary actions live in the bottom 40% of the screen. Top bar only holds title, Demo badge, language toggle. Destructive actions (Pass) are never adjacent to Keep without 16 px+ gap and a different style (outlined vs filled); Pass has a 5-second Undo, not a confirm dialog.
- Bottom sheets (post detail, shop pick) snap to 45% / 90% and can be dragged or dismissed by a visible close button (44 px) for non-gesture users.
- Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px` on `:focus-visible`. Keyboard works on the laptop inbox: `K` = Keep, `P` = Pass, arrows to move.

## 6. Motion
Tokens: durations `instant 80ms · fast 150ms · base 250ms · slow 400ms · hero 700ms`.
Easing: `standard cubic-bezier(.2,0,0,1)`, `decel cubic-bezier(.05,.7,.1,1)` (things arriving), `accel cubic-bezier(.3,0,.8,.15)` (leaving), `spring cubic-bezier(.34,1.56,.64,1)` (pop/bounce, small overshoot).

| Moment | Spec | Reduced-motion fallback |
|---|---|---|
| Press | scale .97, 80 ms standard | colour change only |
| Screen / sheet | sheet slides up 250 ms decel; fade 150 ms | fade 120 ms |
| **Countdown ring** | SVG ring, r=26 (pin card) / r=64 (detail). `stroke-dasharray = C`, `stroke-dashoffset = C × (1 − remaining/7200s)`. Rotated −90° so it drains clockwise from the top. `transition: stroke-dashoffset 1s linear`. Colour by phase (§7). Number ticks each second, shown as `1h 12m` then `9m 41s` under 10 min. Remaining time is **computed from `expires_at`**, never from a local counter (phone sleep, tab throttling). | no transition; ring jumps once per second; no pulse |
| **Pin pop-in** | scale 0 → 1.15 → 1 over 420 ms `spring`, plus a one-time expanding ring (opacity .5 → 0, 600 ms) | appear with 120 ms fade |
| Fresh pin idle | slow glow pulse 2.4 s ease-in-out infinite | none |
| Last-10-min pin | faster pulse 1.0 s, number visible | none (text + colour already say it) |
| Reading-the-sign steps | each step: dot fills, check draws 200 ms, next step slides in 150 ms; indeterminate shimmer on active line | static checks |
| **Coupon landing** | ticket drops from above (translateY −120 → 0, 450 ms `spring`), settles with 2 small bounces (−8 px, −3 px), confetti burst of ≤ 24 warm dots 700 ms, number "+1 coupon" counts in the wallet icon with a badge pop 300 ms | ticket fades in 150 ms, check icon, no confetti, no bounce (haptic and sound still fire) |
| Keep it / Pass | card flies right with check (Keep) / fades left (Pass) 250 ms; list closes the gap 150 ms | instant removal with Undo toast |

Rules: animate `transform` and `opacity` only; ≤ 1 hero animation on screen; nothing loops without `prefers-reduced-motion` being honoured. Global CSS in §12 collapses all durations under `prefers-reduced-motion: reduce`.

## 7. Map style and pins
**Base style:** OpenFreeMap `dark`, no API key: `https://tiles.openfreemap.org/styles/dark` (verified 2026-10-27, HTTP 200, 47 layers, vector source `https://tiles.openfreemap.org/planet`, font stack `Noto Sans Regular`; the Thai glyph range file loads, 200; Thai place names in tiles not checked). After the style loads, **warm it up** with `setPaintProperty` (skip any layer id that isn't found):

| Layer id(s) | Property | Value |
|---|---|---|
| `background` | `background-color` | `#0E0C0B` |
| `water`, `waterway` | `fill-color` / `line-color` | `#12171B` |
| `landuse_park`, `landcover_wood` | `fill-color` | `#14170F` |
| `landuse_residential` | `fill-color` | `#0F0D0C` |
| `building` | `fill-color` / outline | `#171311` / `#211D1A` |
| `highway_path`, `highway_minor` | `line-color` | `#2B2623` |
| `highway_major_inner`, `highway_major_subtle` | `line-color` | `#3A332E` |
| `highway_name_other`, `highway_name_motorway`, `place_*` | `text-color` / `text-halo-color` | `#9E948A` / `#0E0C0B` |

Label contrast on the map after override is 6.1–6.6:1 (table above). Attribution: keep MapLibre's built-in control (compact, bottom-left, above the nav). Required text: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (see RESEARCH.md).
Camera defaults: center `[99.9577, 12.5684]` (lng, lat; Soi 102, Hua Hin, placeholder), zoom 16.5, min 13, max 19, pitch 0, rotate off (`dragRotate: false`, `touchZoomRotate` rotation disabled) so people never get lost.

**Pins** (HTML markers inside a 44×44 hit area; ≤ ~60 on screen, then cluster). Freshness uses minutes **remaining** of the 120:

| State | When | Look | Extra cue (not colour only) |
|---|---|---|---|
| **Fresh** | > 60 min left | 44 px circle `accent`, 2 px `fg` outline, shop-type glyph, `shadow-glow`, slow pulse, ring full to ≥ half | chip under pin: `1h 40m` |
| **Aging** | 10–60 min left | 40 px `pin-aging`, no glow, no pulse (lantern dims) | chip `38m`, ring under half |
| **Last 10 min** | < 10 min | 44 px `pin-last`, fast pulse, ring nearly empty | chip `9m` bold, tiny "last call" clock icon |
| **Expired** | 0 | removed from map (it lives in the owner's inbox) | none |
| Selected | any | +4 px outline `fg`, pin lifts 4 px, sheet opens | |
| You | | blue-white dot `#7DB8FF` with accuracy halo | |

Chips are `caption` 12 px bold on `surface-2` at 90% opacity (text `fg`). Tap = open the post sheet; long-press does nothing. Thai shop names label pins from zoom ≥ 17.5 only (avoid clutter). Demo-mode pins get a small "DEMO" dot? **No**: the banner already says it; pins stay identical so judges see the real look.

## 8. States
| State | Pattern |
|---|---|
| **Loading** | Skeleton shapes in `surface-2` with a 1.4 s shimmer (static under reduced motion). Map shows the dark background instantly while tiles stream. Photos load blurred-up (10 px blur → sharp 250 ms). |
| **Empty** | Illustration-free, one warm line + one button. Map: "Nobody's snapped this street yet. Be the first." [Snap a shop]. Wallet: "No coupons yet. Snap a shop you're at." Inbox: "All caught up. New photos land here after 2 hours." |
| **Error** | Inline card, `danger-soft` bg, `danger` icon + text, one retry button, plain words ("Lost the signal. Try again."). Never raw error codes (put a small "Details" disclosure for support). |
| **Offline** | Persistent slim banner "You're offline. Showing the last map." Snap queues the photo and says so. |
| **Success** | Toast bottom, above nav, 3.5 s, `success-soft`, announces via `aria-live="polite"`. |

## 9. Voice and microcopy
Tone: a friendly local who points you to good food. Short, verb-first, warm, a little playful, never salesy, never jargon ("AI", "geofence", "token"). No exclamation overload (max one per screen). Thai uses polite particles sparingly (ค่ะ/ครับ avoided on buttons so it fits any speaker; used only in longer messages if at all).

| Key | English | ไทย |
|---|---|---|
| snap.cta | Snap a shop | ถ่ายร้านเลย |
| post.go | Go now | ไปเลย |
| inbox.keep | Keep it | เก็บไว้ |
| inbox.pass | Pass | ไม่เอา |
| inbox.undo | Undo | ยกเลิก |
| reading.title | Reading the sign… | กำลังอ่านป้ายร้าน… |
| reading.blur | Blurring faces | กำลังเบลอใบหน้า |
| reading.translate | Translating the text | กำลังแปลข้อความ |
| reading.match | Finding your shop | กำลังหาร้านของคุณ |
| confirm.q | Is this the place? | ใช่ร้านนี้ไหม |
| confirm.yes | Yes, that's it | ใช่เลย |
| confirm.no | Not this one | ไม่ใช่ร้านนี้ |
| loc.ask | Use my location | ใช้ตำแหน่งของฉัน |
| loc.why | Only to show shops near you and match your photo. | ใช้เพื่อแสดงร้านใกล้คุณและจับคู่รูปเท่านั้น |
| demo.try | Try demo mode | ลองโหมดเดโม |
| demo.banner | Demo mode · pretend location: Soi 102, Hua Hin | โหมดเดโม · ตำแหน่งสมมติ: ซอย 102 หัวหิน |
| auth.google | Continue with Google | ดำเนินการต่อด้วย Google |
| auth.email | Send me a code | ส่งรหัสให้ฉัน |
| timer.left | {t} left | เหลือ {t} |
| timer.over | Time's up | หมดเวลาแล้ว |
| coupon.landed | Nice shot! A coupon is in your wallet. | ภาพสวย! คูปองเข้ากระเป๋าแล้ว |
| coupon.show | Show this at the counter | แสดงที่หน้าร้าน |
| coupon.used | Used | ใช้แล้ว |
| empty.map | Nobody's snapped this street yet. Be the first. | ยังไม่มีใครถ่ายถนนนี้ เป็นคนแรกเลย |
| err.net | Lost the signal. Try again. | สัญญาณหลุด ลองอีกครั้ง |
| err.cam | Camera is blocked. Let's turn it on in Settings. | กล้องถูกปิดอยู่ มาเปิดในการตั้งค่ากัน |
| err.loc | We can't see where you are. Pick a shop from the list instead. | ยังไม่รู้ตำแหน่งของคุณ เลือกร้านจากรายการแทนได้ |

Credit line on shop page: "Photo by {name}" / "ภาพโดย {name}".

## 10. Haptics and sound
- **Haptics**: `navigator.vibrate` exists on Android Chrome, **not on iOS Safari** (so treat as progressive enhancement, never required). Patterns: shutter `10`, matched shop `[10,40,10]`, coupon landed `[15,60,25]`, Keep `20`, Pass `10`. Respect `prefers-reduced-motion` by shortening, and a "Haptics" switch in You. (An iOS-only trick using `<input type="checkbox" switch>` exists; **uncertain**, skip for the hackathon.)
- **Sound**: off by default, one toggle in You. Three short (< 300 ms), soft, wooden/marimba cues: shutter tick, "found it" two-note, coupon "ting". Only after a user gesture, Web Audio or a tiny preloaded mp3/ogg, volume ≤ 0.4, never autoplay, silent if device is muted.

## 11. PWA gotchas (iOS Safari + Android Chrome)
Sources and uncertainty are in RESEARCH.md.
- **Viewport**: `viewport-fit=cover` (Next `export const viewport = { viewportFit: "cover", themeColor: "#0F0D0C", colorScheme: "dark" }`), use `env(safe-area-inset-top/bottom/left/right)`; use `dvh`, not `vh` (iOS URL bar). Fixed bottom nav must include `padding-bottom: env(safe-area-inset-bottom)`. `overscroll-behavior-y: none` to stop pull-to-refresh fights with the map and sheets.
- **iOS home-screen icon** comes from `apple-touch-icon` (180×180), not only from the manifest. Provide icons 180, 192, 512 and a **maskable** 512 (safe zone: keep the glyph inside the central 60%). `appleWebApp: { capable: true, title: "Prox Now", statusBarStyle: "black-translucent" }`.
- **Install prompt**: Android Chrome fires `beforeinstallprompt`: stash the event, show our own "Install Prox Now" card **after a success moment** (first coupon), never at first load; hide when `display-mode: standalone`. iOS has **no** such event: show a one-time card "Tap Share, then Add to Home Screen" with a small diagram, only in iOS Safari non-standalone, dismissible, remembered 30 days. Detect standalone with `matchMedia("(display-mode: standalone)")` or `navigator.standalone`.
- **Camera = `<input type="file" accept="image/*" capture="environment">`** (opens the native camera, works in Safari, Home-Screen app and Chrome; ignored on desktop where it's a file picker, which is perfect for the laptop demo). Hidden input triggered from the big Snap button. Don't use `getUserMedia` for v1 (iOS standalone re-prompts every launch and has had camera freeze bugs). Android may **kill the browser tab while the camera app is open**: save the draft (step, location, demo flag) in `sessionStorage` before opening the camera and restore on return. Read EXIF orientation by drawing with `createImageBitmap(file, { imageOrientation: "from-image" })`.
- **Photo size**: phone photos are 3–12 MB; Vercel Functions reject request bodies over 4.5 MB. Downscale on the phone (longest side 1600 px, JPEG q .8, ≈ 300–600 KB) before upload; strip EXIF (privacy), take GPS from the Geolocation API, not from the photo.
- **Geolocation**: HTTPS only. Ask **only when needed** (first Snap, or tapping "center on me"), after a one-line "why" card (`loc.why`). Use `getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }`. On iOS the Permissions API can say `prompt` even after a denial, and the permission may be one-time: **do not rely on `permissions.query`**; just call and handle error code 1 (denied), 2 (unavailable), 3 (timeout).
- **Denial recovery** (never a dead end): show the `err.loc` / `err.cam` card with 3 steps for the user's OS (iOS: Settings → Privacy & Security → Location Services → Safari Websites, or Camera; Android: tap the lock icon in the address bar → Permissions) plus two alternatives: "Pick a shop from the list" and "Try demo mode". Re-check when the app returns to the foreground (`visibilitychange`).
- **iOS tap quirks**: `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on buttons (kills 300 ms double-tap-zoom delay); 16 px inputs; `user-select: none` on the map and buttons, not on text.
- **Auth**: use a **6-digit email code** rather than a magic link (a link opens in Safari, not in the installed app, and the session lands in the wrong place). Google OAuth redirect inside an installed iOS app: **uncertain**, test on a real iPhone; fall back to the browser tab if it breaks.
- **Map**: MapLibre v6 needs WebGL2. Check support and show a friendly fallback (list of shops) rather than a blank map.

## 12. Ready-to-paste Tailwind v4 theme + `app/globals.css`
Fonts are wired in `app/layout.tsx` with `next/font/google` (variables `--font-latin`, `--font-thai`).

```css
@import "tailwindcss";

@theme {
  /* colour */
  --color-bg: #0F0D0C;
  --color-surface-1: #181513;
  --color-surface-2: #211D1A;
  --color-surface-3: #2B2621;
  --color-border: #3B342E;
  --color-border-strong: #7A6F64;
  --color-fg: #F7F0E8;
  --color-fg-muted: #BDB2A6;
  --color-fg-subtle: #A39888;
  --color-accent: #FF8A3D;
  --color-accent-pressed: #E8701F;
  --color-accent-ink: #1C0E05;
  --color-accent-soft: #33200F;
  --color-success: #5BD18B;
  --color-success-soft: #12261B;
  --color-warning: #FFD166;
  --color-warning-soft: #2E2508;
  --color-danger: #FF6B6B;
  --color-danger-soft: #2E1414;
  --color-info: #7DB8FF;
  --color-info-soft: #111F30;
  --color-ink: #0F0D0C;
  --color-pin-aging: #C99A4E;
  --color-pin-last: #FF5D5D;

  /* radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* elevation */
  --shadow-card: 0 1px 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px rgb(0 0 0 / 0.35);
  --shadow-sheet: 0 -12px 40px rgb(0 0 0 / 0.5);
  --shadow-glow: 0 0 0 6px rgb(255 138 61 / 0.18), 0 8px 28px rgb(255 138 61 / 0.35);

  /* type scale */
  --text-caption: 0.75rem;
  --text-caption--line-height: 1.4;
  --text-label: 0.875rem;
  --text-label--line-height: 1.4;
  --text-body: 1rem;
  --text-body--line-height: 1.5;
  --text-heading: 1.125rem;
  --text-heading--line-height: 1.35;
  --text-title: 1.5rem;
  --text-title--line-height: 1.25;
  --text-display: 2.125rem;
  --text-display--line-height: 1.15;
  --text-timer: 2.5rem;
  --text-timer--line-height: 1;

  /* motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-decel: cubic-bezier(0.05, 0.7, 0.1, 1);
  --ease-accel: cubic-bezier(0.3, 0, 0.8, 0.15);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --animate-pin-pop: pin-pop 420ms var(--ease-spring) both;
  --animate-pin-pulse: pin-pulse 2.4s ease-in-out infinite;
  --animate-pin-pulse-fast: pin-pulse 1s ease-in-out infinite;
  --animate-coupon-drop: coupon-drop 700ms var(--ease-spring) both;
  --animate-shimmer: shimmer 1.4s linear infinite;

  @keyframes pin-pop {
    0% { transform: scale(0); opacity: 0; }
    60% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); }
  }
  @keyframes pin-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgb(255 138 61 / 0.35); }
    50% { box-shadow: 0 0 0 10px rgb(255 138 61 / 0); }
  }
  @keyframes coupon-drop {
    0% { transform: translateY(-120px); opacity: 0; }
    55% { transform: translateY(0); opacity: 1; }
    72% { transform: translateY(-8px); }
    86% { transform: translateY(0); }
    93% { transform: translateY(-3px); }
    100% { transform: translateY(0); }
  }
  @keyframes shimmer {
    from { background-position: -200% 0; }
    to { background-position: 200% 0; }
  }
}

/* fonts come from next/font variables set on <html> */
@theme inline {
  --font-sans: var(--font-latin), var(--font-thai), ui-sans-serif, system-ui, sans-serif;
}

:root {
  color-scheme: dark;
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --nav-h: 64px;
}

@utility pt-safe { padding-top: env(safe-area-inset-top, 0px); }
@utility pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
@utility min-h-screen-dvh { min-height: 100dvh; }
@utility tap { min-height: 44px; min-width: 44px; touch-action: manipulation; }

@layer base {
  html { background: var(--color-bg); color: var(--color-fg); -webkit-text-size-adjust: 100%; }
  body {
    min-height: 100dvh;
    font-family: var(--font-sans);
    font-size: 1rem;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
  }
  :lang(th) { line-height: 1.65; letter-spacing: 0; }
  button, [role="button"], a { touch-action: manipulation; }
  input, select, textarea { font-size: 16px; }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  ::selection { background: var(--color-accent-soft); color: var(--color-fg); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Fonts in `app/layout.tsx`:
```tsx
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from "next/font/google";
const latin = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const thai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-thai", display: "swap" });
// <html lang="en" className={`${latin.variable} ${thai.variable}`}>
```

## 13. Components cheat sheet (names used by the build prompts)
`AppShell` (column + bottom nav) · `BottomNav` · `SnapButton` · `CountdownRing` · `Pill` (button) · `Card` · `Sheet` · `Toast` · `DemoBanner` · `EmptyState` · `Skeleton`. Files live in `components/ui/` and `components/shell/`; copy dictionary in `lib/copy.ts` (`en`/`th`, keys from §9).

## 14. Accessibility checklist
Text ≥ 4.5:1, UI ≥ 3:1 (done). Targets ≥ 44 px. All icons paired with labels or `aria-label`. Countdown has `role="timer"` with `aria-label="Expires in 1 hour 12 minutes"`, **not** live-announced each second (update the label every minute; announce once at 10 min and 1 min). Map has a list view alternative ("Shops near you") for screen-reader and keyboard users. Photos have alt text: "{shop} photo by {name}, {time ago}". Reduced motion honoured (§6). No time-limited actions that can't be extended: the 2-hour life is the product, but Keep/Pass has no deadline.
