# Unblur v1: "That's me" — a person can show their own face; everyone else stays blurred

Written for Grok Build. Source of truth. Reuse: app/api/analyze (faces already come back from the Spark read), app/api/posts/route.ts, lib/image/blur.ts (blurFaces, normalizeBoxes), components/snap/SnapFlow.tsx, lib/copy.ts (en + th, parity green). No new migration unless truly needed (next number 0006, file only).

## Principles
- The original is NEVER stored. The phone keeps it in memory until the post succeeds or the person leaves; the server only ever sees it during the single request and returns/stores only the blurred JPEG.
- Default is every face blurred. Only the person can choose to show a face, and only with an explicit confirmation. A person cannot unblur anyone else: the UI says so plainly and allows at most 2 faces to be shown per post (one person, plus a friend who is standing next to them and also agrees: a second tick "They agree").
- Fail closed: if the face boxes cannot be determined, nothing is published (unchanged).
- The server enforces: it re-runs the face read on the uploaded photo (as today), and unblur requests are accepted only for boxes that overlap a detected face by IoU >= 0.4; anything else is ignored and that region stays blurred.

## 1. Snap flow (client)
- After the read returns face boxes, show the photo with each face boxed. Tap a face to toggle "That's me" (confirmation chip below: "I'm showing my own face. Everyone else stays blurred."). Max 2 shown (second needs the extra tick "They agree to be shown"). Default none.
- A preview shows exactly what will be published (blurred except the chosen faces) before Post. Plain line: "Only you are visible. Others are blurred."
- Copy keys en + th. Touch targets 44 px.

## 2. Server (app/api/posts/route.ts)
- Accept an optional `showFaces` form field: JSON array of up to 2 normalized boxes. Validate with normalizeBoxes, drop invalid, match each to the server's own detected faces by IoU >= 0.4, and exclude only matched ones from blurFaces. Add `facesShown` to the response. Tests: none requested keeps everything blurred; a matched box stays unblurred (pixels inside differ from blurred output, others blurred); an unmatched box is ignored; more than 2 is capped; blur_unavailable still fails closed.

## 3. Record
- Store in posts.facts (existing jsonb) { consent_shown: n } only the count, never boxes or biometrics. Unit test that no face geometry is saved.

## 4. Docs and report
- README section "Faces": default blur, "That's me" opt-in, original never stored, max 2 shown, what the server enforces. Branch feat/unblur-v1 from main, commits per section by explicit path, tests + build green, NO push. Report: commits, test count, files, open questions.

## 5. Original goes back to the photographer's phone after posting (added by captain request)
- Flow: take photo, faces are blurred, person optionally taps "That's me", preview, Post. Only the edited (blurred) version is uploaded and stored by Prox Now; the shop only ever receives the edited version.
- After a successful post the success screen shows a primary button "Save my original to my phone" (en + th). It uses navigator.share({ files: [originalFile] }) when canShare supports files (this opens the phone's share sheet, including Save Image / Save to Photos), otherwise falls back to a normal download link from a Blob URL named prox-now-original.jpg. It never uploads the original anywhere.
- When the person leaves the success screen (or taps Snap another) the original File and Blob URLs are dropped from memory (URL.revokeObjectURL, clear state). Unit test the helper that builds the share/download action and that state is cleared; the action must work from a user tap (not automatically).
- Honest note in README: iPhone and Android web pages cannot always save to the camera roll silently, so we ask the person to tap Save.
