import sharp from "sharp";
import { COACH_EDGE } from "./coach";

export async function coachJpeg(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({ width: COACH_EDGE, height: COACH_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}
