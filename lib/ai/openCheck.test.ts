import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  OPEN_CHECK_MAX_EDGE,
  OPEN_CHECK_MAX_PHOTOS,
  OPEN_CHECK_MAX_TOKENS,
  OPEN_CHECK_MODEL,
  OPEN_CHECK_TIMEOUT_MS,
  OPEN_CHECK_URL,
  applyMenuFlags,
  checkMenuOpen,
  downscaleOpenJpeg,
  finishOpenCheck,
  scheduleOpenCheck,
} from "./openCheck";

const photo = "data:image/jpeg;base64,aGVsbG8=";
const items = [{ name: "Pad Thai" }, { name: "Mango" }, { name: "Tea" }];

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("muse spark open check", () => {
  it("confirms items and still posts every name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sent = { url: "", body: {} as Record<string, unknown>, authorization: "" };
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      sent.url = String(url);
      sent.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.authorization = new Headers(init?.headers).get("authorization") ?? "";
      const content =
        "The first photo shows pad thai and tea. The mango is not on the board.\n" +
        '{"confirmed":["Pad Thai","Tea"],"unconfirmed":[]}';
      return jsonResponse(content);
    }) as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: "test-key", fetchImpl });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    const flagged = applyMenuFlags(items, result);
    expect(flagged.map((item) => item.name)).toEqual(["Pad Thai", "Mango", "Tea"]);
    expect(flagged.map((item) => item.needsCheck ?? false)).toEqual([false, false, false]);
    expect(sent.url).toBe(OPEN_CHECK_URL);
    expect(sent.body.model).toBe(OPEN_CHECK_MODEL);
    expect(sent.body.max_tokens).toBeGreaterThanOrEqual(2000);
    expect(sent.body.max_tokens).toBe(OPEN_CHECK_MAX_TOKENS);
    expect(sent.authorization).toBe("Bearer test-key");
    expect(warn).not.toHaveBeenCalled();
  });

  it("flags unconfirmed items and does not drop them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = (async () =>
      jsonResponse('{"confirmed":["Pad Thai","Tea"],"unconfirmed":["Mango","Tea"]}')) as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: "test-key", fetchImpl });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    const flagged = applyMenuFlags(
      [{ name: "Pad Thai" }, { name: "mango" }, { name: "Tea" }, { name: "Soup" }],
      result,
    );
    expect(flagged).toHaveLength(4);
    expect(flagged.find((item) => item.name === "Pad Thai")?.needsCheck).toBeUndefined();
    expect(flagged.find((item) => item.name === "mango")?.needsCheck).toBe(true);
    expect(flagged.find((item) => item.name === "Tea")?.needsCheck).toBe(true);
    expect(flagged.find((item) => item.name === "Soup")?.needsCheck).toBeUndefined();
  });

  it("fails open on timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as typeof fetch;
    const result = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl,
      timeoutMs: 20,
    });
    expect(OPEN_CHECK_TIMEOUT_MS).toBe(45_000);
    expect(result).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("timeout");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("test-key");
  });

  it("fails open on bad json and on a non-200", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl: (async () => jsonResponse("I am not sure about this menu.")) as typeof fetch,
    });
    expect(bad).toEqual({ ran: false });
    const http = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    expect(http).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain("bad json");
    expect(String(warn.mock.calls[1]?.[0])).toContain("http 503");
  });

  it("fails open when the key is missing and does not call fetch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn() as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: null, fetchImpl });
    expect(result).toEqual({ ran: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("no key");
    const empty = await checkMenuOpen({ images: [{ dataUrl: photo }], items: [] });
    expect(empty).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("sends item text and at most two photos", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sent = { body: {} as { messages?: { content?: { type?: string; text?: string }[] }[] } };
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.body = JSON.parse(String(init?.body));
      return jsonResponse('{"confirmed":["Pad Thai"],"unconfirmed":[]}');
    }) as typeof fetch;
    await checkMenuOpen({
      images: [
        { dataUrl: photo },
        { dataUrl: photo },
        { dataUrl: photo },
        { dataUrl: "https://example.test/menu.jpg" },
      ],
      items: [{ name: "Pad Thai", price: "60" }, { name: "Mango" }],
      apiKey: "test-key",
      fetchImpl,
    });
    const content = sent.body.messages?.[0]?.content ?? [];
    const photos = content.filter((part) => part.type === "image_url");
    expect(photos).toHaveLength(OPEN_CHECK_MAX_PHOTOS);
    expect(content.find((part) => part.type === "text")?.text).toContain("Pad Thai — 60");
    expect(content.find((part) => part.type === "text")?.text).toContain("Mango");
  });

  it("downscales a photo so the long edge is at most 1024", async () => {
    expect(OPEN_CHECK_MAX_EDGE).toBe(1024);
    const big = await sharp({
      create: { width: 2000, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const dataUrl = await downscaleOpenJpeg(big);
    expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64")).metadata();
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1024);
  });

  it("schedules the check after the caller returns", async () => {
    let queued: (() => Promise<void>) | null = null;
    let ran = false;
    scheduleOpenCheck(
      async () => {
        ran = true;
      },
      (task) => {
        queued = task;
      },
    );
    expect(ran).toBe(false);
    expect(queued).toBeTypeOf("function");
    await queued!();
    expect(ran).toBe(true);
    expect(() =>
      scheduleOpenCheck(async () => undefined, () => {
        throw new Error("outside a request scope");
      }),
    ).not.toThrow();
  });

  it("writes needsCheck and open_check without dropping other book fields", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const saved: { id: string; extracted: unknown; aiMeta: Record<string, unknown> }[] = [];
    await finishOpenCheck({
      pages: [
        {
          id: "page-1",
          extracted: {
            section: "menu",
            items: [
              { name: "Pad Thai", price: "60" },
              { name: "Mango", price: "40" },
            ],
          },
          aiMeta: { model: "muse-spark-1.3", photo_hash: "abc" },
          jpeg: Buffer.from("not-a-jpeg"),
        },
      ],
      downscale: async () => photo,
      check: async (input) => {
        expect(input.images).toHaveLength(1);
        expect(input.items.map((item) => item.name)).toEqual(["Pad Thai", "Mango"]);
        expect(input.timeoutMs).toBe(45_000);
        return { ran: true, confirmed: ["Pad Thai"], unconfirmed: ["Mango"] };
      },
      save: async (row) => {
        saved.push(row);
      },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.aiMeta).toEqual({ model: "muse-spark-1.3", photo_hash: "abc", open_check: true });
    const extracted = saved[0]?.extracted as {
      section?: string;
      items?: { name: string; price?: string; needsCheck?: boolean }[];
    };
    expect(extracted.section).toBe("menu");
    expect(extracted.items?.[0]).toEqual({ name: "Pad Thai", price: "60" });
    expect(extracted.items?.[1]).toEqual({ name: "Mango", price: "40", needsCheck: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs one line when the after-save check throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let queued: (() => Promise<void>) | null = null;
    scheduleOpenCheck(
      async () => {
        throw new Error("boom secret");
      },
      (task) => {
        queued = task;
      },
    );
    await queued!();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("error");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("secret");
  });
});
