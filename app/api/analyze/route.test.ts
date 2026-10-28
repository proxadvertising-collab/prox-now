import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SECRET = "test-meta-key";

function jsonResponse(text: string, status = 200, model?: string) {
  return new Response(
    JSON.stringify({
      ...(model ? { model } : {}),
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
        '```json\n{"shop_id":"mala-mafia","confidence":0.92,"sign_text":[{"thai":"มาล่า","english":"mala"}],"quality_score":8,"quality_reason":"sharp","faces":[[0.1,0.1,0.2,0.2]],"category":"food","safe_to_post":true,"safe_reason":"","facts":{"sign_language":"th","captions":{"en":"Mala"}}}\n```',
        200,
        "response-model",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(imageRequest(new Uint8Array([1, 2, 3, 4])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("confirm");
    expect(body.noMatch).toBeNull();
    expect(body.picker.length).toBeLessThanOrEqual(5);
    expect(body.picker.every((shop: { distanceM: number }) => shop.distanceM <= 300)).toBe(true);
    expect(body.result.shopId).toBe("mala-mafia");
    expect(body.result.confidence).toBe(0.92);
    expect(JSON.stringify(body).includes(SECRET)).toBe(false);
    const init = fetchMock.mock.calls[0]?.[1];
    const sent = JSON.parse(String(init?.body));
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("muse-spark-1.3");
    expect(body.scene.model).toBe("response-model");
    expect(body.scene.facesFound).toBe(1);
    expect(body.scene.facesBlurred).toBeNull();
    expect(body.scene.languages).toEqual({ source: "th", target: "en" });
    expect(body.scene.signs).toEqual([{ original: "มาล่า", translated: "mala" }]);
    expect(body.scene.steps.map((step: { step: string }) => step.step)).toEqual(["shops", "match"]);
    expect(body.scene.steps.every((step: { ms: number }) => step.ms >= 0)).toBe(true);
    expect(JSON.stringify(sent).includes("previous_response_id")).toBe(false);
  });

  it("says the AI is resting when Meta is rate limited or out of credits", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    const limited = vi.fn(async () => new Response("rate limit", { status: 429 }));
    vi.stubGlobal("fetch", limited);
    const rate = await POST(imageRequest(new Uint8Array([7])));
    expect(rate.status).toBe(503);
    expect(await rate.json()).toEqual({ error: "ai_resting" });

    const credits = vi.fn(async () => new Response("insufficient credits", { status: 402 }));
    vi.stubGlobal("fetch", credits);
    const broke = await POST(imageRequest(new Uint8Array([8])));
    expect(broke.status).toBe(503);
    expect(await broke.json()).toEqual({ error: "ai_resting" });
  });

  it("turns malformed model output into pick-all", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("this is not json")));

    const response = await POST(imageRequest(new Uint8Array([9])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("pick-all");
    expect(body.noMatch).toBe("which_shop");
    expect(body.picker.length).toBeGreaterThan(0);
    expect(body.picker.length).toBeLessThanOrEqual(5);
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
    expect(body.noMatch).toBe("which_shop");
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

  it("turns a real GPS fix with no nearby place into none_near and does not call the model", async () => {
    vi.stubEnv("META_API_KEY", "");
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(imageRequest(new Uint8Array([4, 5]), "image/jpeg", { lat: "0", lng: "0" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("pick-all");
    expect(body.noMatch).toBe("none_near");
    expect(body.picker).toEqual([]);
    expect(body.candidates).toEqual([]);
    expect(body.result.shopId).toBeNull();
    expect(body.ms).toBe(0);
    expect(body.scene.steps.map((step: { step: string }) => step.step)).toEqual(["shops"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers the nearest shops when the photo does not match one of them", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          '{"shop_id":null,"confidence":0,"sign_text":[],"quality_score":6,"quality_reason":"a plate of food, no shop name","faces":[],"category":"food","safe_to_post":true,"safe_reason":""}',
        ),
      ),
    );

    const response = await POST(imageRequest(new Uint8Array([6])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("pick-all");
    expect(body.noMatch).toBe("which_shop");
    expect(body.picker).toHaveLength(5);
    expect(body.picker.every((shop: { distanceM: number }) => shop.distanceM <= 300)).toBe(true);
    for (let index = 1; index < body.picker.length; index += 1) {
      const previous = body.picker[index - 1] as { id: string; distanceM: number };
      const current = body.picker[index] as { id: string; distanceM: number };
      const ordered =
        previous.distanceM < current.distanceM ||
        (previous.distanceM === current.distanceM && previous.id <= current.id);
      expect(ordered).toBe(true);
    }
    expect(body.picker[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String), distanceM: expect.any(Number) }),
    );
  });

  it("asks for a retake only when the photo itself is unreadable", async () => {
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          '{"shop_id":null,"confidence":0,"sign_text":[],"quality_score":1,"quality_reason":"too blurry and dark","faces":[],"category":"","safe_to_post":true,"safe_reason":""}',
        ),
      ),
    );

    const response = await POST(imageRequest(new Uint8Array([6, 6])));
    const body = await response.json();

    expect(body.noMatch).toBe("retake");
    expect(body.picker).toEqual([]);
    expect(body.decision).toBe("pick-all");
  });
});
