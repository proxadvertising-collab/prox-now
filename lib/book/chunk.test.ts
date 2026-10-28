import { describe, expect, it } from "vitest";
import { MetaTruncated } from "../ai/meta";
import { chunkItems, readChunked } from "./chunk";
import { MAX_IMAGES_PER_CALL } from "./limits";

describe("chunkItems", () => {
  it("keeps a short menu in one call and splits past the cap", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(chunkItems(items.slice(0, 5), MAX_IMAGES_PER_CALL)).toEqual([[1, 2, 3, 4, 5]]);
    expect(chunkItems(items, MAX_IMAGES_PER_CALL)).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8],
      [9],
    ]);
    expect(chunkItems(items.slice(0, 5), 1)).toEqual([[1], [2], [3], [4], [5]]);
  });
});

describe("readChunked", () => {
  it("merges chunk results in page order", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const seen: number[][] = [];
    const result = await readChunked(items, MAX_IMAGES_PER_CALL, async (chunk) => {
      seen.push([...chunk]);
      const rows = [...chunk].reverse().map((index) => ({ index, name: "p" + index }));
      return { rows, latencyMs: 3 };
    });
    expect(seen).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8],
      [9],
    ]);
    expect(result.calls).toBe(2);
    expect(result.rows.map((row) => row.index)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 9]);
  });

  it("halves a truncated call and does not keep the cut-off body", async () => {
    const seen: number[][] = [];
    const result = await readChunked([1, 2, 3, 4], 4, async (chunk) => {
      seen.push([...chunk]);
      if (chunk.length > 2) throw new MetaTruncated("response-model", 4);
      return {
        rows: chunk.map((index) => ({ index, price: "50" })),
        latencyMs: 2,
      };
    });
    expect(seen).toEqual([[1, 2, 3, 4], [1, 2], [3, 4]]);
    expect(result.calls).toBe(3);
    expect(result.chunks).toEqual([
      { images: 2, latencyMs: 2 },
      { images: 2, latencyMs: 2 },
    ]);
    expect(result.rows.map((row) => row.price)).toEqual(["50", "50", "50", "50"]);
  });
});
