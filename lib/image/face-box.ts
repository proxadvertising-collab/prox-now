export type FaceBox = [number, number, number, number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A box bigger than a quarter of the frame shrinks around its center. A found face is never dropped. */
export function capFaceBox(box: FaceBox): FaceBox {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const area = w * h;
  if (!(area > 0.25) || w <= 0 || h <= 0) return box;
  const scale = Math.sqrt(0.25 / area);
  const nw = w * scale;
  const nh = h * scale;
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  let x1 = cx - nw / 2;
  let y1 = cy - nh / 2;
  let x2 = cx + nw / 2;
  let y2 = cy + nh / 2;
  if (x1 < 0) {
    x2 -= x1;
    x1 = 0;
  }
  if (y1 < 0) {
    y2 -= y1;
    y1 = 0;
  }
  if (x2 > 1) {
    x1 -= x2 - 1;
    x2 = 1;
  }
  if (y2 > 1) {
    y1 -= y2 - 1;
    y2 = 1;
  }
  x1 = clamp(x1, 0, 1);
  y1 = clamp(y1, 0, 1);
  x2 = clamp(x2, 0, 1);
  y2 = clamp(y2, 0, 1);
  if (x2 - x1 < 0.002 || y2 - y1 < 0.002) return box;
  return [x1, y1, x2, y2];
}
