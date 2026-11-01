import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateWindows } from "../../../../lib/rate/window";
import { POST } from "./route";

const { signInWithPassword } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword },
  }),
}));

describe("POST /api/judge/enter", () => {
  beforeEach(() => {
    resetRateWindows();
    signInWithPassword.mockReset();
    vi.stubEnv("DEMO_EXPLORER_EMAIL", "");
    vi.stubEnv("DEMO_EXPLORER_PASSWORD", "");
    vi.stubEnv("DEMO_OWNER_EMAIL", "");
    vi.stubEnv("DEMO_OWNER_PASSWORD", "");
  });

  it("returns 503 when the demo shopper env is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/judge/enter?role=explorer", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_not_ready" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 503 when the demo owner env is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/judge/enter?role=owner", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_not_ready" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("expires the judge and demo cookies after a real sign-in", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const response = await POST(
      new Request("http://localhost/api/judge/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com", password: "secret" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/map" });
    const expired = response.headers.getSetCookie().map((row) => row.toLowerCase());
    expect(expired.some((row) => row.startsWith("prox-judge=") && row.includes("max-age=0"))).toBe(true);
    expect(expired.some((row) => row.startsWith("prox-demo=") && row.includes("max-age=0"))).toBe(true);
  });
});
