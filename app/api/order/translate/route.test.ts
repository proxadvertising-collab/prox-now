import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("../../../../lib/order/translate", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/order/translate")>("../../../../lib/order/translate");
  return { ...actual, allowOrderTranslate: () => true };
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

function metaPayload(output: unknown): Response {
  return new Response(JSON.stringify({ output }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/order/translate", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for an empty note", async () => {
    const response = await call({ text: "   ", to: "th" });
    expect(response.status).toBe(400);
  });

  it("returns 413 over 500 characters", async () => {
    const response = await call({ text: "a".repeat(501), to: "th" });
    expect(response.status).toBe(413);
  });

  it("returns the text when Meta sends reasoning and text", async () => {
    const previous = process.env.META_API_KEY;
    process.env.META_API_KEY = "meta-test";
    const fetchMock = vi.fn().mockResolvedValue(
      metaPayload([
        { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking about the note" }] },
        { type: "message", content: [{ type: "output_text", text: "ไม่ใส่มะเขือเทศ" }] },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await call({ text: "no tomatoes", to: "th" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ translation: "ไม่ใส่มะเขือเทศ" });
      const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
        max_output_tokens: number;
        input: { content: { text: string }[] }[];
      };
      expect(sent.max_output_tokens).toBe(1500);
      expect(sent.input[0]?.content[0]?.text).toContain("Thai");
    } finally {
      if (previous === undefined) delete process.env.META_API_KEY;
      else process.env.META_API_KEY = previous;
      vi.unstubAllGlobals();
    }
  });

  it("returns 502 when Meta sends no text", async () => {
    const previous = process.env.META_API_KEY;
    process.env.META_API_KEY = "meta-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        metaPayload([{ type: "reasoning", content: [{ type: "reasoning_text", text: "no tomatoes" }] }]),
      ),
    );
    try {
      const response = await call({ text: "no tomatoes", to: "th" });
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: "empty_translation" });
      expect(JSON.stringify(body)).not.toContain("no tomatoes");
    } finally {
      if (previous === undefined) delete process.env.META_API_KEY;
      else process.env.META_API_KEY = previous;
      vi.unstubAllGlobals();
    }
  });
});
