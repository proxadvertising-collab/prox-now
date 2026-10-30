import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const allow = vi.hoisted(() => vi.fn(() => true));

vi.mock("../../../../lib/order/translate", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/order/translate")>("../../../../lib/order/translate");
  return { ...actual, allowOrderTranslate: allow };
});

vi.mock("../../../../lib/rate/window", () => ({
  clientIp: () => "203.0.113.8",
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/order/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function metaText(text: string): Response {
  return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/order/translate with a batch of menu titles", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.META_API_KEY;
    process.env.META_API_KEY = "meta-test";
    allow.mockClear();
    allow.mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
  });

  it("translates every title in one Meta call and one rate-limit hit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(metaText('```json\n["ต้มยำกุ้ง", "ข้าวผัด", "ชาเย็น"]\n```'));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call({ texts: ["Tom yum goong", "Fried rice", "Thai iced tea"], to: "th" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translations: ["ต้มยำกุ้ง", "ข้าวผัด", "ชาเย็น"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenCalledTimes(1);
    const sent = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(sent).toContain("Tom yum goong");
    expect(sent).toContain("Thai iced tea");
  });

  it("rejects an empty, oversized, or non-string batch with 400", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const texts of [[], ["ok", ""], ["ok", 3], Array.from({ length: 26 }, (_, i) => "dish " + i), ["a".repeat(201)]]) {
      const response = await call({ texts, to: "th" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_texts" });
    }
    expect(allow).not.toHaveBeenCalled();
  });

  it("fails closed when Meta returns the wrong number of titles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(metaText('["ต้มยำกุ้ง"]')));
    const response = await call({ texts: ["Tom yum goong", "Fried rice"], to: "th" });
    expect(response.status).toBe(502);
  });

  it("returns 429 when the IP is over its limit", async () => {
    allow.mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call({ texts: ["Fried rice"], to: "th" });
    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
