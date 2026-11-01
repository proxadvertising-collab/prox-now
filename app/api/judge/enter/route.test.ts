import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateWindows } from "../../../../lib/rate/window";
import { POST } from "./route";

const { signInWithPassword, getUser, demoQuery, allowJudge } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  demoQuery: vi.fn(),
  allowJudge: vi.fn(async () => true),
}));

vi.mock("../../../../lib/rate/window", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/rate/window")>(
    "../../../../lib/rate/window",
  );
  return { ...actual, allowJudge };
});

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword, getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => demoQuery(),
        }),
      }),
    }),
  }),
}));

describe("POST /api/judge/enter", () => {
  beforeEach(() => {
    resetRateWindows();
    signInWithPassword.mockReset();
    getUser.mockReset();
    demoQuery.mockReset();
    allowJudge.mockReset();
    allowJudge.mockResolvedValue(true);
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    demoQuery.mockResolvedValue({ data: [], error: null });
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
    expect(allowJudge).toHaveBeenCalled();
  });

  it("skips the judge limit when the session already has a demo account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "demo-user" } }, error: null });
    demoQuery.mockResolvedValue({ data: [{ role: "owner" }], error: null });
    allowJudge.mockResolvedValue(false);
    const response = await POST(
      new Request("http://localhost/api/judge/enter?role=explorer", { method: "POST" }),
    );
    expect(allowJudge).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_not_ready" });
  });

  it("still counts a first sign-in that has no demo account", async () => {
    allowJudge.mockResolvedValue(false);
    const signedOut = await POST(
      new Request("http://localhost/api/judge/enter?role=explorer", { method: "POST" }),
    );
    expect(signedOut.status).toBe(429);
    expect(await signedOut.json()).toEqual({ error: "rate_limited" });

    getUser.mockResolvedValue({ data: { user: { id: "real-user" } }, error: null });
    demoQuery.mockResolvedValue({ data: [], error: null });
    const realAccount = await POST(
      new Request("http://localhost/api/judge/enter?role=owner", { method: "POST" }),
    );
    expect(realAccount.status).toBe(429);
    expect(allowJudge).toHaveBeenCalledTimes(2);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
