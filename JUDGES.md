# Judging Prox Now

**Live app:** https://prox-now.vercel.app/judge
**Time:** about 5 minutes for both roles.
**You need:** a browser. No password, camera, location, phone or personal account.

## Before you start
- **Sign-in is one tap.** "I'm Judge 1 (shopper)" and "I'm Judge 2 (shop owner)" sign you into two shared demo accounts. The server holds their credentials, so you never see a password.
- **Do Judge 1 first, then Judge 2, one after the other.** The owner's thank-you card only appears after Judge 1 has added book pages.
- **All judges share the demo.** If someone else is mid-run, their data may show up, and "End demo" resets the shared demo data for everyone. Sign-out is local to this browser, so another judge on the same account stays signed in. If the owner desk is empty or looks wrong, tap **Start fresh demo** on /judge and begin again.
- **Please don't refresh** while "Building your book" is on screen. It takes about a minute.
- If you see "Too many tries this hour", wait a few minutes and try once more.

| Name on screen | Demo account | Starts at |
|---|---|---|
| Judge 1 (shopper) | Explorer | the camera, `/snap?tour=1&samples=1` |
| Judge 2 (shop owner) | Owner (already owns the 8 demo shops) | the owner desk, `/owner?tour=1` |

A bar at the top shows **Step N of 9**, with **Swap roles** and **End demo**, and a short card explains each step.

## Judge 1: shopper
| # | Do this | You should see | What it proves |
|---|---|---|---|
| 1 Seed | Tap **I'm Judge 1 (shopper)**. You land on `/snap?tour=1&samples=1` and the sample photos load automatically | 3 real photos of a café in the seed tray | Seeding works without a camera; the seed coach (Meta AI) reads each photo |
| 2 Book | Tap **Done (3)** | "Building your book…", then the shop's book with pages by category | `muse-spark-1.3` reads several photos in one call and builds the pages |
| 3 Ask | Open **Map**, tap **Ask**, type e.g. "coffee and brunch" | An answer that picks open shops | Live recommendations from Meta AI over open shops |
| 4 Translate | In the book, tap **Add** on a few items, open **View order**, type a request, tap **Translate** | The note in the shop's language | Meta AI translates item names and the note |
| 5 Order | Tap **Show to staff** | The counter screen with quantities and the translated note | A tourist can order without speaking Thai |
| 6 Post (optional) | Snap or upload a photo and post it to the map | A live pin, with faces blurred | Face boxes from Meta AI, blurred on the server |

## Judge 2: shop owner
| # | Do this | You should see | What it proves |
|---|---|---|---|
| 7 Claim | Tap **I'm Judge 2 (shop owner)** (or **Swap roles**) | Your demo shops. Demo shops skip the claim code; a real shop needs a code photo that Meta AI checks [verify] | Owner verification |
| 8 Thank them | Under **New from shoppers**, find "… built your book". Tap **Give coupon**, keep the offer or edit it, pick 1, 7 or 30 days, then tap **Give coupon** | "Coupon sent to …" | Owners reward the people who built their book |
| 9 Coupon | **Swap roles** opens the wallet. Scratch the card or tap **Reveal code** | A QR code and a short code. The owner can type the code at **Redeem a coupon** | The loop closes from shopper to owner and back |

Finish with **End demo**. It resets the shared demo data and signs you out of this browser only.

## One person playing both roles
Do Judge 1, steps 1 to 5. Tap **Swap roles** to become the owner and do step 8. Tap **Swap roles** again. That opens the wallet. Scratch the coupon or tap **Reveal code** (step 9). Then tap **End demo**.

## If you use an AI agent or a script
- The demo needs a browser session. The public proof endpoints are `GET /api/health` and `GET /api/meta-ping`; the second makes one real Meta call, so please don't loop it.
- Run the roles in order in one agent, not as two parallel agents.
- Use a mobile viewport if you can (390×844). Desktop works too.

## Where to check the code
- Judge mode: `app/judge/`, `app/api/judge/{enter,exit,reset}/route.ts`, `lib/judge/script.ts`, `components/judge/TourChrome.tsx`
- Book: `app/api/book/pages/route.ts`, `lib/book/`
- Owner desk and thanks: `components/owner/OwnerDesk.tsx`, `app/api/owner/thank/route.ts`, `supabase/migrations/0023_book_thanks.sql`
- Wallet: `components/wallet/WalletList.tsx`
- Every Meta call: see "Meta models used" in [README.md](README.md)
