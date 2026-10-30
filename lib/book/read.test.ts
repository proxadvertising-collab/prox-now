import { beforeEach, describe, expect, it, vi } from "vitest";
import { callSparkImages, MetaTruncated, type SparkImagesResult } from "../ai/meta";
import { MAX_IMAGES_PER_CALL } from "./limits";
import { bookReadPrompt } from "./prompt";
import { readBook, type IndexedImage } from "./read";

const SECRET = "test-meta-key";

function images(count: number): IndexedImage[] {
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    dataUrl: "data:image/jpeg;base64,QQ",
  }));
}

function ok(raw: unknown, model = "muse-spark-1.3-live"): SparkImagesResult {
  return { raw, usage: null, ms: 7, model, callId: "call_test" };
}

function menu(indexes: number[], price = "50") {
  return {
    pages: indexes.map((index) => ({
      index,
      kind_guess: "menu",
      is_menu: true,
      language: "en",
      section: null,
      items: [{ name: "Dish " + index, price, currency: null, note: null }],
    })),
    shop_language: "en",
    tagline_facts: ["Dish 1"],
  };
}

function indexesOf(input: { images: readonly { label: string }[] }): number[] {
  return input.images.map((image) => Number(image.label.replace("Image ", "").replace(":", "")));
}

describe("readBook", () => {
  it("sends five pages in one call and nine pages in two, then merges in order", async () => {
    const seen: number[][] = [];
    const call = vi.fn(async (input: { images: readonly { label: string }[] }) => {
      const indexes = indexesOf(input);
      seen.push(indexes);
      const reversed = {
        ...menu(indexes),
        pages: [...menu(indexes).pages].reverse(),
      };
      return ok(reversed);
    });

    const five = await readBook(images(5), MAX_IMAGES_PER_CALL, call as never);
    expect(five.calls).toBe(1);
    expect(five.read.pages.map((page) => page.index)).toEqual([1, 2, 3, 4, 5]);
    expect(five.model).toBe("muse-spark-1.3-live");
    expect(five.read.pages[4]?.items[0]?.name).toBe("Dish 5");

    seen.length = 0;
    const nine = await readBook(images(9), MAX_IMAGES_PER_CALL, call as never);
    expect(seen).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9]]);
    expect(nine.calls).toBe(2);
    expect(nine.read.pages.map((page) => page.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(nine.chunks.map((chunk) => chunk.images)).toEqual([8, 1]);
  });

  it("uses one call per page when the limit is 1", async () => {
    const seen: number[][] = [];
    const call = vi.fn(async (input: { images: readonly { label: string }[] }) => {
      const indexes = indexesOf(input);
      seen.push(indexes);
      return ok(menu(indexes));
    });
    const result = await readBook(images(5), 1, call as never);
    expect(seen).toEqual([[1], [2], [3], [4], [5]]);
    expect(result.calls).toBe(5);
    expect(result.read.pages.map((page) => page.items[0]?.name)).toEqual([
      "Dish 1",
      "Dish 2",
      "Dish 3",
      "Dish 4",
      "Dish 5",
    ]);
  });

  it("retries a truncated reply in half-size chunks and drops the cut-off JSON", async () => {
    const prices: string[] = [];
    const call = vi.fn(async (input: { images: readonly { label: string }[] }) => {
      const indexes = indexesOf(input);
      if (indexes.length > 2) {
        prices.push("TRUNCATED");
        throw new MetaTruncated("muse-spark-1.3-live", 9);
      }
      prices.push("50");
      return ok(menu(indexes, "50"));
    });
    const result = await readBook(images(4), 4, call as never);
    expect(result.calls).toBe(3);
    expect(prices).toEqual(["TRUNCATED", "50", "50"]);
    expect(result.read.pages.map((page) => page.items[0]?.price)).toEqual(["50", "50", "50", "50"]);
  });
});

describe("callSparkImages", () => {
  beforeEach(() => {
    vi.stubEnv("META_API_KEY", SECRET);
  });

  it("sends labeled jpeg parts, store false, and a low reasoning effort", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          id: "call_live",
          model: "muse-spark-1.3-live",
          output: [{ content: [{ type: "output_text", text: JSON.stringify(menu([1, 2])) }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await callSparkImages({
      prompt: bookReadPrompt([1, 2]),
      images: [
        { label: "Image 1:", imageDataUrl: "data:image/jpeg;base64,QQ" },
        { label: "Image 2:", imageDataUrl: "data:image/jpeg;base64,Qg" },
      ],
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(String(init.body));
    const header = new Headers(init.headers);
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("muse-spark-1.3");
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect(sent.max_output_tokens).toBe(700);
    expect(sent.input[0].content.map((part: { type: string; text?: string }) => part.text ?? part.type)).toEqual([
      bookReadPrompt([1, 2]),
      "Image 1:",
      "input_image",
      "Image 2:",
      "input_image",
    ]);
    expect(header.get("Authorization")).toBe("Bearer " + SECRET);
    expect(result.model).toBe("muse-spark-1.3-live");
    expect(result.callId).toBe("call_live");
    expect(JSON.stringify(result).includes(SECRET)).toBe(false);
    expect(bookReadPrompt([1])).toContain("Never invent anything not visible");
    expect(bookReadPrompt([1])).toContain("street_food");
    expect(bookReadPrompt([1], true)).toContain("shorter");
  });

  it("rejects a body that hit max_output_tokens even when the JSON parses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            model: "muse-spark-1.3-live",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ content: [{ type: "output_text", text: JSON.stringify(menu([1], "TRUNCATED")) }] }],
          }),
          { status: 200 },
        );
      }),
    );
    await expect(
      callSparkImages({
        prompt: "read",
        images: [{ label: "Image 1:", imageDataUrl: "data:image/jpeg;base64,QQ" }],
      }),
    ).rejects.toBeInstanceOf(MetaTruncated);
  });
});
