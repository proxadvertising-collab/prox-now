export type NormBox = [number, number, number, number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cleanFaceBoxes(value: unknown): NormBox[] {
  if (!Array.isArray(value)) return [];
  const clean: NormBox[] = [];
  for (const box of value) {
    if (!Array.isArray(box) || box.length !== 4) continue;
    if (box.some((part) => typeof part !== "number" || !Number.isFinite(part))) continue;
    let [x1, y1, x2, y2] = box as number[];
    x1 = clamp(x1, 0, 1);
    y1 = clamp(y1, 0, 1);
    x2 = clamp(x2, 0, 1);
    y2 = clamp(y2, 0, 1);
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    if (x2 - x1 < 0.002 || y2 - y1 < 0.002) continue;
    clean.push([x1, y1, x2, y2]);
    if (clean.length === 20) break;
  }
  return clean;
}

export function toggleShown(selected: readonly number[], index: number, friendAgrees: boolean): number[] {
  if (!Number.isInteger(index) || index < 0) return [...selected];
  if (selected.includes(index)) return selected.filter((item) => item !== index);
  if (selected.length === 0) return [index];
  if (selected.length >= 2 || !friendAgrees) return [...selected];
  return [selected[0], index];
}

export function showFacesPayload(boxes: readonly NormBox[], selected: readonly number[]): NormBox[] {
  const out: NormBox[] = [];
  for (const index of selected) {
    const box = boxes[index];
    if (!box || out.length === 2) continue;
    out.push(box);
  }
  return out;
}

export function previewRgba(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  boxes: readonly NormBox[],
  shown: readonly number[],
): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) out[index] = pixels[index] ?? 0;
  const block = 8;
  boxes.forEach((box, index) => {
    if (shown.includes(index)) return;
    const boxW = Math.max(0, box[2] - box[0]);
    const boxH = Math.max(0, box[3] - box[1]);
    const pad = 0.2;
    const x0 = clamp(Math.floor((box[0] - boxW * pad) * width), 0, Math.max(0, width - 1));
    const y0 = clamp(Math.floor((box[1] - boxH * pad) * height), 0, Math.max(0, height - 1));
    const x1 = clamp(Math.ceil((box[2] + boxW * pad) * width), x0 + 1, width);
    const y1 = clamp(Math.ceil((box[3] + boxH * pad) * height), y0 + 1, height);
    for (let y = y0; y < y1; y += block) {
      for (let x = x0; x < x1; x += block) {
        const source = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 4;
        const red = out[source] ?? 0;
        const green = out[source + 1] ?? 0;
        const blue = out[source + 2] ?? 0;
        const alpha = out[source + 3] ?? 255;
        const yStop = Math.min(y + block, y1);
        const xStop = Math.min(x + block, x1);
        for (let yy = y; yy < yStop; yy += 1) {
          for (let xx = x; xx < xStop; xx += 1) {
            const pixel = (yy * width + xx) * 4;
            out[pixel] = red;
            out[pixel + 1] = green;
            out[pixel + 2] = blue;
            out[pixel + 3] = alpha;
          }
        }
      }
    }
  });
  return out;
}
