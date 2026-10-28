import sharp from "sharp";
import { blurFaces } from "../image/blur";
import { MAX_STORED_BYTES, META_JPEG_QUALITY, META_LONG_EDGE, STORED_LONG_EDGE } from "./limits";

export function jpegDataUrl(jpeg: Buffer): string {
  return "data:image/jpeg;base64," + jpeg.toString("base64");
}

/** The copy sent to Meta. Separate from the stored page, which stays at the spec's 1600 px cap. */
export async function metaJpeg(original: Buffer): Promise<Buffer> {
  return sharp(original, { failOn: "none" })
    .rotate()
    .resize({
      width: META_LONG_EDGE,
      height: META_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: META_JPEG_QUALITY })
    .toBuffer();
}

export class StoredTooBig extends Error {
  constructor() {
    super("too_big");
    this.name = "StoredTooBig";
  }
}

/** Blurs every supplied face, then keeps the JPEG under 1 MB. There is no unblur path. */
export async function storedJpeg(
  original: Buffer,
  boxes: number[][],
): Promise<{ bytes: Buffer; width: number; height: number }> {
  let quality = META_JPEG_QUALITY;
  let edge = STORED_LONG_EDGE;
  let bytes = await blurFaces(original, boxes, { maxEdge: edge, quality });
  while (bytes.length > MAX_STORED_BYTES && quality > 40) {
    quality -= 10;
    bytes = await blurFaces(original, boxes, { maxEdge: edge, quality });
  }
  while (bytes.length > MAX_STORED_BYTES && edge > 800) {
    edge -= 200;
    bytes = await blurFaces(original, boxes, { maxEdge: edge, quality });
  }
  if (bytes.length > MAX_STORED_BYTES) throw new StoredTooBig();
  const meta = await sharp(bytes).metadata();
  return { bytes, width: meta.width ?? 0, height: meta.height ?? 0 };
}
