import { describe, expect, it } from "vitest";
import { cleanFaceBoxes, previewRgba, showFacesPayload, toggleShown, type NormBox } from "./faces";

describe("face choice", () => {
  it("keeps at most two faces and requires agreement for the second", () => {
    expect(toggleShown([], 0, false)).toEqual([0]);
    expect(toggleShown([0], 1, false)).toEqual([0]);
    expect(toggleShown([0], 1, true)).toEqual([0, 1]);
    expect(toggleShown([0, 1], 2, true)).toEqual([0, 1]);
    expect(toggleShown([0, 1], 0, true)).toEqual([1]);
  });

  it("sends only the chosen boxes", () => {
    const boxes = cleanFaceBoxes([
      [0.1, 0.1, 0.3, 0.4],
      [0.5, 0.2, 0.7, 0.5],
      [1, 2, 3],
      [0.8, 0.8, 0.95, 0.95],
    ]);
    expect(boxes).toHaveLength(3);
    expect(showFacesPayload(boxes, [0, 2, 1])).toEqual([boxes[0], boxes[2]]);
  });

  it("blurs every face in the preview except the ones that were chosen", () => {
    const width = 16;
    const height = 8;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 251;
    const boxes: NormBox[] = [
      [0, 0, 0.5, 1],
      [0.5, 0, 1, 1],
    ];
    const kept = previewRgba(pixels, width, height, boxes, [0]);
    const left = (width + 1) * 4;
    expect(kept[left]).toBe(pixels[left]);
    const right = (4 * width + width - 1) * 4;
    expect(kept[right]).not.toBe(pixels[right]);
    const all = previewRgba(pixels, width, height, boxes, []);
    expect(all[left]).not.toBe(pixels[left]);
  });

  it("blurs a small face plus its margin and leaves far pixels alone", () => {
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = index % 200;
      pixels[index + 1] = 40;
      pixels[index + 2] = 90;
      pixels[index + 3] = 255;
    }
    const blurred = previewRgba(pixels, width, height, [[0.46, 0.46, 0.54, 0.54]], []);
    const far = (2 * width + 2) * 4;
    expect(blurred[far]).toBe(pixels[far]);
    const outside = (50 * width + 10) * 4;
    expect(blurred[outside]).toBe(pixels[outside]);
    const center = (50 * width + 50) * 4;
    expect(blurred[center]).not.toBe(pixels[center]);
  });
});
