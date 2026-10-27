import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SECRET = "test-meta-key";

function jsonResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function imageRequest(bytes: Uint8Array, type = "image/jpeg", fields?: Record<string, string>) {
  const form = new FormData();
  const copy = Uint8Array.from(bytes);
  form.set("image", new File([copy.buffer], "shop.jpg", { type }));
  form.set("lat", "12.5685");
  form.set("lng", "99.9575");
  for (const [key, value] of Object.entries(fields ?? {})) form.set(key, value);
  return new Request("http://localhost/api/analyze", { method: "POST", body: form });
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  it("returns 503 when the Meta key is missing and does not call fetch", async () => {
    vi.stubEnv("META_API_KEY", "");
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(imageRequest(new Uint8Array([1, 2, 3])));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "ai_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses a fenced JSON answer", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      jsonResponse(
        '```json\n{"shop_id":"mala-mafia","confidence":0.92,"sign_text":[{"thai":"มาล่า","english":"mala"}],"quality_score":8,"quality_reason":"sharp","faces":[],"category":"food","safe_to_post":true,"safe_reason":""}\n```',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(imageRequest(new Uint8Array([1, 2, 3, 4])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("confirm");
    expect(body.result.shopId).toBe("mala-mafia");
    expect(body.result.confidence).toBe(0.92);
    expect(JSON.stringify(body).includes(SECRET)).toBe(false);
    const init = fetchMock.mock.calls[0]?.[1];
    const sent = JSON.parse(String(init?.body));
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("muse-spark-1.3");
    expect(JSON.stringify(sent).includes("previous_response_id")).toBe(false);
  });

  it("turns malformed model output into pick-all", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("this is not json")));

    const response = await POST(imageRequest(new Uint8Array([9])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("pick-all");
    expect(body.result.shopId).toBeNull();
    expect(body.result.confidence).toBe(0);
  });

  it("drops a shop id that is not in the candidate list", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse('{"shop_id":"not-a-shop","confidence":0.99,"sign_text":[],"quality_score":5,"quality_reason":"","faces":[],"category":"","safe_to_post":true,"safe_reason":""}'),
      ),
    );

    const response = await POST(imageRequest(new Uint8Array([7])));
    const body = await response.json();

    expect(body.decision).toBe("pick-all");
    expect(body.result.shopId).toBeNull();
    expect(body.result.confidence).toBe(0);
  });

  it("rejects an oversize file before calling the model", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(imageRequest(new Uint8Array(3 * 1024 * 1024 + 1)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "too_large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
