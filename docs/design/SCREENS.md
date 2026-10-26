# Prox Now — Screens (wireframe-level spec)

Tokens, colours, motion and copy keys come from `DESIGN.md` (e.g. `accent`, `surface-2`, `pin-last`, copy key `snap.cta`). Frames are ~390 px wide phones unless noted. `[ ]` = button, `( )` = ring/avatar, `░` = skeleton/photo.
Routes: `/` home/landing · `/login` · `/welcome` (onboarding) · `/map` · `/snap` · `/post/[id]` · `/wallet` · `/inbox` · `/claim/[shopSlug]` · `/me`.

---
## 1. First-run onboarding (max 3 steps, no permissions asked)
**Goal:** a stranger understands the idea in 10 seconds and is on the map in under 20.
```
┌──────────────────────────┐   step 1 of 3  ●○○           [Skip]
│                          │
│   (warm illustration:    │   "See what's good, right now."
│    a lantern-lit street  │   People eating there snap a photo.
│    with 3 glowing pins)  │   It shows on the map for 2 hours.
│                          │
│  [        Next        ]  │   ← bottom third, 56 px
└──────────────────────────┘
step 2: "Snap a shop, get a treat."  Photo of a shop you're at → a coupon from the shop.
step 3: "You decide what's shared."  Faces are blurred. Shops choose Keep or Pass.
        [ Start exploring ]   (link) Try demo mode
```
- **Key elements:** progress dots (text "1 of 3" for screen readers), Skip always visible, language toggle EN | ไทย top right, sign-in comes **after** the first map view (map is public; sign-in is asked at first Snap / Wallet).
- **No location prompt here.** It is asked on the map when the person taps "center on me" or on first Snap, with the `loc.why` line first.
- **States:** loading = none (static, preloaded); error = none; returning user skips straight to `/map`; offline works (all local).
- **Delight:** step art gently parallaxes on swipe (off under reduced motion); pins on the art pop in one by one (`pin-pop`); copy is tiny and human, not feature lists.

---
## 2. Map home (`/map`)
**Goal:** "What's happening on this street right now?" answered with zero taps.
```
┌──────────────────────────┐
│ ▓ DEMO MODE banner ▓ (if on, see §9)
│ Prox Now        [EN|ไทย] │  top bar (title, lang)
│ ┌──────────────────────┐ │
│ │      dark map        │ │
│ │   (●1h40m)           │ │   pins with time chips (§7 of DESIGN)
│ │          (●38m)      │ │
│ │     ◉ you            │ │
│ │              (●9m)   │ │
│ │                  [⌖] │ │   center-on-me, 44 px, right, above nav
│ └──────────────────────┘ │
│ ┌ Soi 102 · 3 live now ──┐│   peek sheet (45% on tap): list of live posts,
│ │ ▸ Mala Mafia   1h 40m  ││   soonest-to-expire first, each row has mini ring
│ └────────────────────────┘│
│ [Map][Wallet] (SNAP) [Shop][You]│
└──────────────────────────┘
```
- **Key elements:** MapLibre dark map, pins by freshness, you-dot, center-on-me, peek sheet with count and list (also the screen-reader/keyboard alternative), bottom nav with raised Snap.
- **Behaviour:** opens centred on Soi 102 (Demo) or on the last known position; tap pin → selected state + sheet shows post card; tap card → `/post/[id]`; pins refresh via Supabase Realtime (or 15 s poll fallback) and pop in; expired pins fade out 250 ms; time chips re-render every 30 s.
- **Loading:** dark background instantly, skeleton row in the peek sheet, pins appear as data arrives. **Empty:** "Nobody's snapped this street yet. Be the first." + [Snap a shop]. **Error:** inline card "Lost the signal. Try again." + Retry; map stays usable with cached pins. **No WebGL2:** list-only view with a note. **Location denied:** map still works, centred on demo/Hua Hin, banner `err.loc` with "Pick a shop" and "Try demo mode".
- **Delight:** pins pop with the expanding ring; lantern pins dim as time passes, so the map visibly "breathes"; pull the sheet up to see a street-food list sorted by "ending soon", which creates urgency without nagging.

---
## 3. Snap flow (`/snap`)
**Goal:** from tap to a live pin in ≤ 4 taps and ≤ 20 s.
```
A. Camera           B. Shot review        C. Reading the sign      D. Confirm shop
┌───────────────┐  ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ native camera │  │ ░░░░░░░░░░░░░░ │   │ ░ photo (blurred │   │ Is this the place?│
│  (opens via   │  │ ░░ your shot ░ │   │   up as it goes) │   │ ┌──────────────┐ │
│  input        │  │ ░░░░░░░░░░░░░░ │   │ ✓ Photo saved    │   │ │ Mala Mafia   │ │
│  capture)     │  │ Tip: include   │   │ ✓ Blurring faces │   │ │ 18 m · cart  │ │
│               │  │ the sign       │   │ ◔ Reading sign…  │   │ │[Yes, that's it]│
│               │  │ [Retake][Use]  │   │ ○ Translating    │   │ └──────────────┘ │
└───────────────┘  └────────────────┘   │ ○ Finding shop   │   │ Not this one? ▾   │
                                        └──────────────────┘   │ ○ Coconut shake 24m│
                                                               │ ○ Pak Kapi     31m │
                                                               │ ○ Other / not listed│
                                                               └──────────────────┘
```
- **Steps:** (A) tap the raised Snap button → location "why" card the first time → OS camera via file input. (B) review: Retake / Use photo, tip "Get the sign in the shot". (C) "Reading the sign…": a checklist with 5 named steps (Photo saved → Blurring faces → Reading the sign → Translating the text → Finding your shop). Steps tick as the server finishes each; total target < 10 s; photo is downscaled on-device first. (D) Confirm: top match as a large card with distance and category; "Yes, that's it" (primary); "Not this one?" opens a short list (max 4 nearest within 150 m, with distance) + "Not listed" (creates a pending shop for owner claim, pin hidden until a human/owner OKs it, shown to the user as "We'll add it soon").
- **Behaviour:** after confirm, the pin pops onto the map **immediately** (optimistic) and a toast says "You're live for 2 hours. Thanks!" with the countdown ring starting; user lands on the map centred on their pin.
- **States:** *No location:* skip auto-match, go straight to the shop list sorted A–Z with search, plus "Try demo mode". *Camera cancelled:* back to map, no error. *Camera blocked:* `err.cam` card with OS steps. *Low confidence match:* D shows 3 candidates equally, no pre-selection. *Already posted at this shop in the last 2 h:* friendly note "You already lit up this shop. Come back later" (anti-spam). *Upload/AI fails:* the step that failed turns `danger`, copy "Lost the signal. Try again." with Retry that resumes from that step; the photo stays saved locally. *Offline:* queued, banner "We'll post it when you're back online".
- **Delight:** steps fill like a small lantern string; the photo sharpens as faces get blurred (visible proof of privacy); Thai sign text appears over the photo as translated chips (see §4); shutter haptic and soft tick.

---
## 4. Live post detail (`/post/[id]`, bottom sheet 90%)
**Goal:** decide "is it worth walking there?" in one glance.
```
┌──────────────────────────┐
│ ░░░░░░ photo ░░░░░░░░░░░ │  16:10 crop, faces blurred, scrim at bottom
│ ░ Mala Mafia · cart  (✕) │
├──────────────────────────┤
│  ( 1h 12m )  left        │  ring r=64 + timer 40 px, ring colour by phase
│  Snapped 48 min ago by Ploy│  photographer credited
│  🚶 6 min walk · 450 m    │  uses your location or demo location
│  [        Go now        ] │  primary 56 px → opens maps app walking route
├──────────────────────────┤
│ On the sign  (EN ⇄ ไทย)   │
│ "Mala BBQ skewers 10฿"    │  translated text chips; tap to see original Thai
│ "หม่าล่า เสียบไม้ 10฿"      │
├──────────────────────────┤
│ [Report photo]  [Share]  │  small, secondary
└──────────────────────────┘
```
- **Key elements:** photo, ring + timer, photographer credit, walking time + distance (haversine ÷ 80 m/min, labelled "about"), Go now, translated text with original/translation toggle, report.
- **Behaviour:** Go now opens `https://www.google.com/maps/dir/?api=1&destination=lat,lng&travelmode=walking` (universal; Apple Maps users get the share sheet fallback). Ring and number count from `expires_at`. At 10 min the ring turns `pin-last` and a warning line "Last call: 9 min" appears. At 0 the sheet becomes "Time's up. This post is with the shop now." and closes the ring.
- **States:** *Loading:* photo skeleton + ring skeleton. *No location:* walking time replaced by "Turn on location for walking time" link (not blocking). *Translation unavailable:* show original text with "Couldn't translate this one" and a Retry. *Post gone/expired:* "This one has ended" + back to map. *Error:* inline retry.
- **Delight:** ring drains smoothly, number is big and tabular; the translated-text chips make Thai signs readable for foreign visitors, which is the "oh!" moment for judges; Go now has a pressed glow.

---
## 5. Wallet and coupon QR (`/wallet`, `/wallet/[couponId]`)
**Goal:** find and show the coupon at the counter in two taps, even in sunlight.
```
┌ Wallet ──────────────────┐        ┌ Coupon ──────────────────┐
│ Active (2)  Used  Expired │        │ Mala Mafia               │
│ ┌──────────────────────┐ │        │ Thanks for the photo!    │
│ │ ▮ Mala Mafia  [ticket]│ │  tap → │   ┌────────────┐         │
│ │   Valid today · 1 free│ │        │   │  QR  (white│         │
│ │   skewer              │ │        │   │  on dark   │         │
│ └──────────────────────┘ │        │   │  card, big)│         │
│ ┌──────────────────────┐ │        │   └────────────┘         │
│ │ ▮ Baan Air …         │ │        │   Code  KRX-482-91       │
│ └──────────────────────┘ │        │ Valid until 23:59 today  │
└──────────────────────────┘        │ [ Brightness up ]        │
                                     └──────────────────────────┘
```
- **Rules shown in UI:** single-use; one coupon per person per shop per day (Bangkok day). Offer text comes from the shop ("1 free skewer" placeholder; shop-set later).
- **Behaviour:** coupon screen puts the QR on a white tile with a quiet zone (scan-friendly), raises screen brightness where supported (**uncertain**: no standard Brightness API; fall back to a white background tile + "turn your brightness up" hint), shows the code as text too (fallback if camera can't scan). After the shop scans/marks used, the card turns "Used" with a check and timestamp, QR greyed out.
- **States:** *Empty:* "No coupons yet. Snap a shop you're at." + [Snap a shop]. *Loading:* ticket skeletons. *Offline:* wallet is cached, QR still renders locally from stored code. *Expired:* greyed, "Expired yesterday". *Error:* retry.
- **Delight:** tickets have a punched-edge shape and slight tilt on press; "Used" stamps in with a small bounce; a streak line "3 shops lit this week" (optional, cheap).

---
## 6. Shop Inbox on laptop (`/inbox`, ≥ 768 px, up to 960 px wide)
**Goal:** the owner clears the queue with one tap each, in seconds, no training.
```
┌ Shop Inbox · Mala Mafia ▾ ───────────────────────── 3 waiting ─ [EN|ไทย] ┐
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ ░░░░░░░░░░░░░░░░░░░░░░ │ Photo by Ploy · 2 h 3 min ago               │ │
│ │ ░░░░  big photo  ░░░░░ │ "Mala BBQ skewers 10฿" (from your sign)      │ │
│ │ ░░░░░░░░░░░░░░░░░░░░░░ │ Faces blurred ✓                              │ │
│ │                        │ Keep it → photo goes on your shop page,      │ │
│ │                        │ Ploy gets a coupon. Pass → photo is deleted. │ │
│ │                        │ [   Keep it  (K)   ]     [ Pass (P) ]        │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│  next ▸ ░░░  ░░░  (thumbnails of queue)                                  │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Key elements:** one card at a time (focus) with a thumbnail strip of the queue, big photo, photographer + age, translated sign text, plain explanation of both outcomes, two buttons: Keep it (filled, accent) and Pass (outlined, neutral). Shortcuts K / P / arrow keys; works with mouse and touch.
- **Behaviour:** one tap, no confirm dialog. Keep → card slides right, toast "Kept. Ploy's coupon is on its way." Pass → card fades left, toast "Passed. Photo deleted." with **Undo for 5 s** (deletion is committed after the timer, not before). Next card slides in. Coupon creation is one-per-person-per-shop-per-day: if Ploy already has today's coupon from this shop, Keep still saves the photo and the toast says "Kept. Ploy already has today's coupon." (no error).
- **States:** *Empty:* "All caught up. New photos land here after 2 hours." *Loading:* card skeleton. *Not an owner / not verified:* "Claim your shop to see its photos" → `/claim/[slug]`. *Error on Keep/Pass:* card stays, danger inline "Didn't go through. Try again." (buttons stay enabled). *Realtime:* new ready posts arrive with a soft chime off by default, badge in the tab title "(3)".
- **Delight:** it feels like clearing email with a satisfying swipe; a tiny counter "Today: 5 kept, 1 passed"; seeing a customer's photo of your own stall is the emotional hook, so the photo is **large**.

---
## 7. The two-phone Keep moment (demo centrepiece)
**Goal:** judges see the full loop live: laptop taps **Keep it**, the photographer's phone reacts within ~2 s.
```
Laptop (owner)                        Phone (photographer)
[ Keep it ] ──────── Realtime ─────▶  screen lights, haptic [15,60,25], soft "ting"
                                      ┌──────────────────────────┐
                                      │       (confetti)         │
                                      │    ┌──────────────┐      │
                                      │    │ 🎟 Mala Mafia │ ← drops in, 2 bounces
                                      │    │ 1 free skewer │      │
                                      │    └──────────────┘      │
                                      │ Nice shot! A coupon is   │
                                      │ in your wallet.          │
                                      │ Your photo is now on     │
                                      │ Mala Mafia's page.       │
                                      │ [ Show coupon ] [ Later ]│
                                      └──────────────────────────┘
```
- **Behaviour:** the phone subscribes to its own coupon inserts (Realtime on `coupons` filtered by `holder_id`, or Broadcast); if the app is closed, the coupon simply appears in Wallet with a badge (push is out of scope). The takeover is a full-screen overlay on whichever screen is open; "Later" dismisses to the map with the wallet icon badge popping "+1".
- **Reduced motion:** ticket fades in, check icon, no confetti or bounce; haptic + sound still fire if enabled.
- **States:** *Realtime down:* wallet badge appears on next poll (≤ 15 s) and a toast; *Pass instead:* phone gets nothing loud, only a quiet note in activity ("Mala Mafia passed on this one. Thanks anyway!") so the photographer isn't hurt; *Already had a coupon today:* "Nice shot! Your photo is on Mala Mafia's page. (One coupon per shop per day.)".
- **Delight:** this is the product's heart: a stranger's photo becomes a real treat. Make the drop, bounce, haptic and "ting" land in the same 450 ms window. Rehearse with both devices on the same Wi‑Fi and Demo mode on.

---
## 8. Shop owner claim flow (`/claim/[shopSlug]`) — light check, no card
**Goal:** an owner proves "this is my shop" in under a minute, with no payment and no paperwork.
```
1 Find   "Which shop is yours?"  search / pick (or arrive from a QR/link on the shop page)
2 Verify "We'll send a 6-digit code"  [email field] or [phone (Thai +66)]  [ Send code ]
3 Code   ( _ _ _ _ _ _ )  auto-advance, paste-friendly, 10-min expiry, [Resend in 30s]
4 Done   "Mala Mafia is yours. Photos will land in your Shop Inbox."  [ Open Shop Inbox ]
```
- **Key elements:** no card, no fees; plain-language reason ("So only the real shop decides Keep or Pass"); the shop's public details shown for reassurance (name, category, pin on a mini map); the code field uses `inputmode="numeric"`, `autocomplete="one-time-code"`.
- **Behaviour (hackathon level):** the code goes to the email/phone the owner types; a claim is marked **"Claimed, not yet checked"** and shown on the shop page as a small badge until a human OKs it (captain decision, see open questions). For seeded Demo shops the captain can pre-approve a demo owner.
- **States:** *Wrong code:* inline "That code didn't match. Try again." (3 tries then 10-min lock, wording "Let's take a short break."). *Expired:* "Code expired. Send a new one." *Already claimed:* "This shop already has an owner. Is that a mistake? Contact us." *Rate limited:* "Too many tries. Wait a minute." *Error:* retry.
- **Delight:** a confetti-free calm check; the next screen shows the **first waiting photo** if there is one ("Ploy already snapped your shop!"), the reason an owner wants to claim.

---
## 9. Demo mode banner and switch
**Goal:** judges anywhere get a full, truthful experience with a pretend location; nobody mistakes it for real data.
```
┌─────────────────────────────────────────────┐ info-soft bg, info text, 44 px tall
│ ⓘ DEMO MODE · pretend location: Soi 102, Hua Hin   [Turn off] │
└─────────────────────────────────────────────┘  (sticky under the status bar, all screens)
```
- **Behaviour:** entry points: onboarding "Try demo mode", map location-denied card, You → Demo mode toggle, `?demo=1` link (for the submission page). Demo sets location to the fixed Soi 102 point, ignores real GPS, seeds a few live pins with staggered `expires_at` (fresh, aging, last 10 min) so every pin style is visible, and labels any post made in demo as `is_demo` (never shown to real users). Snap in demo accepts a sample photo or a real one; the "Finding your shop" step uses the fixed location.
- **States:** off by default. When the user is far from Hua Hin, show a one-time card "You're far from Hua Hin. Try demo mode?" rather than auto-enabling (captain to confirm). Persisted in `localStorage`. The banner text is also read by screen readers (`role="status"`).
- **Delight:** the banner is friendly, not alarming (info blue, not warning yellow); [Turn off] is one tap; the first time it's shown, a one-line tooltip explains: "Everything here is a safe sandbox."
