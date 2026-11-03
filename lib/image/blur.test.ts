import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { blurFaces, capFaceBox, normalizeBoxes } from "./blur";

async function halfAndHalf(): Promise<Buffer> {
  const width = 100;
  const height = 100;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const left = x < width / 2;
      raw[index] = left ? 220 : 10;
      raw[index + 1] = left ? 20 : 20;
      raw[index + 2] = left ? 20 : 220;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("normalizeBoxes", () => {
  it("drops invalid boxes, clamps the rest, and caps the list", () => {
    const boxes: number[][] = [[1, 2, 3], [Number.NaN, 0, 1, 1], [-0.2, -0.2, 1.4, 1.4]];
    for (let i = 0; i < 25; i += 1) {
      const start = (i % 5) * 0.04;
      boxes.push([start, 0.8, start + 0.03, 0.9]);
    }
    const result = normalizeBoxes(boxes);
    expect(result[0]).toEqual([0.25, 0.25, 0.75, 0.75]);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.some((box) => box.length !== 4)).toBe(false);
  });

  it("shrinks one oversized face around its center and still returns it", () => {
    const raw: [number, number, number, number] = [0.08, 0.06, 0.68, 0.51];
    const capped = capFaceBox(raw);
    const boxes = normalizeBoxes([raw]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toEqual(capped);
    const width = capped[2] - capped[0];
    const height = capped[3] - capped[1];
    expect(width * height).toBeCloseTo(0.25, 5);
    expect(width / height).toBeCloseTo((raw[2] - raw[0]) / (raw[3] - raw[1]), 5);
    expect((capped[0] + capped[2]) / 2).toBeCloseTo((raw[0] + raw[2]) / 2, 5);
    expect((capped[1] + capped[3]) / 2).toBeCloseTo((raw[1] + raw[3]) / 2, 5);
    expect(normalizeBoxes([])).toEqual([]);
  });

  it("merges heavily overlapping boxes", () => {
    const result = normalizeBoxes([
      [0.1, 0.1, 0.5, 0.5],
      [0.12, 0.12, 0.52, 0.52],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBeCloseTo(0.1);
    expect(result[0][2]).toBeCloseTo(0.52);
  });
});

describe("blurFaces", () => {
  it("changes pixels inside the box and leaves the outside pixels alone", async () => {
    const input = await halfAndHalf();
    const plain = await blurFaces(input, []);
    const blurred = await blurFaces(input, [[0.46, 0.4, 0.54, 0.6]]);
    const base = await sharp(plain).raw().toBuffer({ resolveWithObject: true });
    const next = await sharp(blurred).raw().toBuffer();
    const { width, height, channels } = base.info;
    const corner = 2 * width * channels + 2 * channels;
    expect(Math.abs(base.data[corner] - next[corner])).toBeLessThan(4);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const center = (cy * width + cx) * channels;
    const delta =
      Math.abs(base.data[center] - next[center]) +
      Math.abs(base.data[center + 1] - next[center + 1]) +
      Math.abs(base.data[center + 2] - next[center + 2]);
    expect(delta).toBeGreaterThan(30);
  });

  it("blurs a small face box and leaves pixels far outside untouched", async () => {
    const input = await halfAndHalf();
    const plain = await blurFaces(input, []);
    const box = [0.46, 0.46, 0.54, 0.54];
    const blurred = await blurFaces(input, [box]);
    const base = await sharp(plain).raw().toBuffer({ resolveWithObject: true });
    const next = await sharp(blurred).raw().toBuffer();
    const { width, height, channels } = base.info;
    const at = (x: number, y: number) => (y * width + x) * channels;
    const far = at(2, 2);
    expect(Math.abs(base.data[far] - next[far])).toBeLessThan(4);
    const outsideMargin = at(30, Math.floor(height / 2));
    expect(Math.abs(base.data[outsideMargin] - next[outsideMargin])).toBeLessThan(4);
    const margin = at(44, Math.floor(height / 2));
    const marginDelta =
      Math.abs(base.data[margin] - next[margin]) +
      Math.abs(base.data[margin + 1] - next[margin + 1]) +
      Math.abs(base.data[margin + 2] - next[margin + 2]);
    expect(marginDelta).toBeGreaterThan(15);
    const center = at(Math.floor(width / 2), Math.floor(height / 2));
    const delta =
      Math.abs(base.data[center] - next[center]) +
      Math.abs(base.data[center + 1] - next[center + 1]) +
      Math.abs(base.data[center + 2] - next[center + 2]);
    expect(delta).toBeGreaterThan(30);
    const padded = 0.08 * 0.2;
    expect(box[2] - box[0] + padded * 2).toBeLessThan(0.2);
  });

  it("strips metadata from the jpeg", async () => {
    const plain = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 40, g: 50, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const tagged = await sharp(plain)
      .withMetadata({ exif: { IFD0: { ImageDescription: "SECRET-GPS" } } })
      .toBuffer();
    const output = await blurFaces(tagged, []);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(output.includes(Buffer.from("SECRET-GPS"))).toBe(false);
  });
});
