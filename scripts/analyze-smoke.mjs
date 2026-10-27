import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node scripts/analyze-smoke.mjs <image>");
  process.exit(1);
}

const bytes = await readFile(imagePath);
const lower = imagePath.toLowerCase();
const type = lower.endsWith(".png")
  ? "image/png"
  : lower.endsWith(".webp")
    ? "image/webp"
    : "image/jpeg";

const form = new FormData();
form.set("image", new Blob([bytes], { type }), basename(imagePath));
form.set("lat", "12.5685");
form.set("lng", "99.9575");

const response = await fetch("http://localhost:3000/api/analyze", {
  method: "POST",
  body: form,
});
const body = await response.json();
const shop = Array.isArray(body.candidates)
  ? body.candidates.find((item) => item && item.id === body.result?.shopId)
  : null;

console.log(
  JSON.stringify(
    {
      decision: body.decision ?? null,
      shop: shop?.name ?? null,
      confidence: body.result?.confidence ?? null,
      ms: body.ms ?? null,
    },
    null,
    2,
  ),
);
