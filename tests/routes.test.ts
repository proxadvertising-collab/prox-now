import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: async () => {},
}));
import { GET as health } from "../app/api/health/route";
import { GET as metaPing } from "../app/api/meta-ping/route";
import { isProtectedPath } from "../lib/supabase/session";

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

describe("isProtectedPath", () => {
  it("gates /snap and leaves /map open", () => {
    expect(isProtectedPath("/snap")).toBe(true);
    expect(isProtectedPath("/snap/now")).toBe(true);
    expect(isProtectedPath("/map")).toBe(false);
  });
});

describe("GET /api/meta-ping", () => {
  it("returns 404 and does not call Meta without a demo owner session", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled in tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("META_API_KEY", "test-meta-key");
    vi.stubEnv("NODE_ENV", "test");

    const response = await metaPing();
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
