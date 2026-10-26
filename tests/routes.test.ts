import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: async () => {},
}));
import { GET as health } from "../app/api/health/route";
import { GET as metaPing } from "../app/api/meta-ping/route";

describe("GET /api/health", () => {
  it("returns ok and a timestamp without calling fetch", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled in tests");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await health();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.time).toBe("string");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/meta-ping", () => {
  it("returns 503 without a key, then calls Meta once", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled in tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("META_API_KEY", "");

    const missing = await metaPing();
    const missingBody = (await missing.json()) as { ok?: boolean; error?: string };
    if (missing.status !== 503 || missingBody.error !== "META_API_KEY not set" || missingBody.ok !== false) {
      throw new Error("missing key should return 503 without calling Meta");
    }
    expect(fetchMock).not.toHaveBeenCalled();

    const fakeKey = "test-meta-key";
    vi.stubEnv("META_API_KEY", fakeKey);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "muse-spark-1.3",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "OK" }],
          },
        ],
      }),
    });

    const response = await metaPing();
    const body = (await response.json()) as {
      ok: boolean;
      model: string;
      text: string;
      ms: number;
    };

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "muse-spark-1.3",
      input: "Reply with the single word OK",
      reasoning: { effort: "low" },
      max_output_tokens: 200,
    });

    const headers = init.headers as Record<string, string>;
    const authorization = String(headers.Authorization ?? "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (token !== fakeKey) {
      throw new Error("Authorization token did not match the test stub");
    }

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.text).toBe("OK");
    expect(typeof body.ms).toBe("number");
    if (JSON.stringify(body).includes(fakeKey)) {
      throw new Error("response included the api key");
    }
  });
});
