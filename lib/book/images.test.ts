import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { META_LONG_EDGE, STORED_LONG_EDGE } from "./limits";
import { metaJpeg, storedJpeg } from "./images";

async function wide(): Promise<Buffer> {
  const width = 1800;
  const height = 900;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const left = x < width / 2;
      raw[index] = left ? 220 : 10;
      raw[index + 1] = left ? 30 : 30;
      raw[index + 2] = left ? 20 : 210;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("book image copies", () => {
  it("sends a 1600 jpeg to Meta and stores a separate blurred copy at most 1600 px", async () => {
    const original = await wide();
    const meta = await metaJpeg(original);
    const metaInfo = await sharp(meta).metadata();
    expect(metaInfo.format).toBe("jpeg");
    expect(Math.max(metaInfo.width ?? 0, metaInfo.height ?? 0)).toBeLessThanOrEqual(META_LONG_EDGE);

    const plain = await storedJpeg(original, []);
    const blurred = await storedJpeg(original, [[0.45, 0.4, 0.55, 0.6]]);
    expect(Math.max(plain.width, plain.height)).toBeLessThanOrEqual(STORED_LONG_EDGE);
    expect(blurred.bytes.length).toBeLessThanOrEqual(1_048_576);
    expect(Buffer.compare(plain.bytes, blurred.bytes)).not.toBe(0);
  });
});
