import sharp from "sharp";

type NormBox = [number, number, number, number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function area(box: NormBox): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

function iou(a: NormBox, b: NormBox): number {
  const left = Math.max(a[0], b[0]);
  const top = Math.max(a[1], b[1]);
  const right = Math.min(a[2], b[2]);
  const bottom = Math.min(a[3], b[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = area(a) + area(b) - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function unionBox(a: NormBox, b: NormBox): NormBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

export function matchShownFaces(
  detected: number[][],
  requested: number[][],
): { blur: NormBox[]; shown: number } {
  const faces = normalizeBoxes(detected);
  const asks = normalizeBoxes(requested).slice(0, 2);
  const used = new Set<number>();
  for (const ask of asks) {
    let best = -1;
    let bestScore = 0;
    for (let index = 0; index < faces.length; index += 1) {
      if (used.has(index)) continue;
      const score = iou(faces[index], ask);
      if (score >= 0.4 && score > bestScore) {
        best = index;
        bestScore = score;
      }
    }
    if (best >= 0) used.add(best);
  }
  return { blur: faces.filter((_, index) => !used.has(index)), shown: used.size };
}

export function normalizeBoxes(boxes: number[][]): NormBox[] {
  const clean: NormBox[] = [];
  for (const box of boxes) {
    if (!Array.isArray(box) || box.length !== 4) continue;
    const nums = box.map((part) => (typeof part === "number" ? part : Number(part)));
    if (nums.some((part) => !Number.isFinite(part))) continue;
    let [x1, y1, x2, y2] = nums;
    x1 = clamp(x1, 0, 1);
    y1 = clamp(y1, 0, 1);
    x2 = clamp(x2, 0, 1);
    y2 = clamp(y2, 0, 1);
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    if (x2 - x1 < 0.002 || y2 - y1 < 0.002) continue;
    clean.push([x1, y1, x2, y2]);
  }

  const merged: NormBox[] = [];
  for (const box of clean) {
    let absorbed = false;
    for (let index = 0; index < merged.length; index += 1) {
      if (iou(merged[index], box) >= 0.5) {
        merged[index] = unionBox(merged[index], box);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push(box);
  }
  return merged.slice(0, 20);
}

async function obscure(region: Buffer, width: number, height: number): Promise<Buffer> {
  const sigma = Math.max(12, Math.round(Math.min(width, height) / 8));
  try {
    return await sharp(region).blur(Math.min(sigma, 1000)).toBuffer();
  } catch {
    const tinyW = Math.max(1, Math.min(8, width));
    const tinyH = Math.max(1, Math.round((tinyW * height) / width));
    return sharp(region)
      .resize(tinyW, tinyH, { kernel: "nearest" })
      .resize(width, height, { kernel: "nearest" })
      .toBuffer();
  }
}

export async function blurFaces(
  jpeg: Buffer,
  boxes: number[][],
  opts?: { maxEdge?: number; quality?: number; pad?: number },
): Promise<Buffer> {
  const maxEdge = opts?.maxEdge ?? 1024;
  const quality = opts?.quality ?? 80;
  const pad = opts?.pad ?? 0.25;
  const rotated = await sharp(jpeg, { failOn: "none" }).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  let current = await sharp(rotated).resize(outW, outH, { fit: "fill" }).png().toBuffer();

  for (const [x1, y1, x2, y2] of normalizeBoxes(boxes)) {
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    const leftN = clamp(x1 - boxW * pad, 0, 1);
    const topN = clamp(y1 - boxH * pad, 0, 1);
    const rightN = clamp(x2 + boxW * pad, 0, 1);
    const bottomN = clamp(y2 + boxH * pad, 0, 1);
    const left = Math.min(outW - 1, Math.max(0, Math.floor(leftN * outW)));
    const top = Math.min(outH - 1, Math.max(0, Math.floor(topN * outH)));
    const right = Math.min(outW, Math.max(left + 1, Math.ceil(rightN * outW)));
    const bottom = Math.min(outH, Math.max(top + 1, Math.ceil(bottomN * outH)));
    const cropW = right - left;
    const cropH = bottom - top;
    const extracted = await sharp(current).extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
    const blurred = await obscure(extracted, cropW, cropH);
    current = await sharp(current).composite([{ input: blurred, left, top }]).png().toBuffer();
  }

  return sharp(current).jpeg({ quality }).toBuffer();
}
