import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc, remove, allowReset, signInWithPassword } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  allowReset: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("../../../../lib/rate/window", () => ({
  allowReset,
  clientIp: () => "203.0.113.10",
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ remove }) },
  }),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, signInWithPassword },
    rpc,
  }),
}));

describe("POST /api/judge/reset", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    remove.mockReset();
    allowReset.mockReset();
    signInWithPassword.mockReset();
    signInWithPassword.mockResolvedValue({ error: null });
    vi.stubEnv("DEMO_EXPLORER_EMAIL", "");
    vi.stubEnv("DEMO_EXPLORER_PASSWORD", "");
    allowReset.mockResolvedValue(true);
    remove.mockResolvedValue({ data: null, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "demo" } }, error: null });
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it("resets for a signed-in demo account and does not sign anyone in", async () => {
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/snap" });
    expect(allowReset).toHaveBeenCalledWith("203.0.113.10");
    expect(rpc).toHaveBeenCalledWith("reset_demo");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    const source = readFileSync(resolve(process.cwd(), "app/api/judge/reset/route.ts"), "utf8");
    expect(source).not.toContain("signInWithPassword");
    expect(source).not.toContain("DEMO_EXPLORER");
    expect(source).toContain('signInDemoRole(supabase, "explorer")');
    expect(source).toContain("allowReset");
    expect(source).not.toContain("allowJudge");
  });

  it("rejects a signed-in person who is not a demo account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "captain" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: "not_demo" } });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_demo" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("signs in the demo shopper when nobody is signed in, then resets", async () => {
    vi.stubEnv("DEMO_EXPLORER_EMAIL", "shopper@example.com");
    vi.stubEnv("DEMO_EXPLORER_PASSWORD", "demo-pass");
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/snap" });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "shopper@example.com", password: "demo-pass" });
    expect(rpc).toHaveBeenCalledWith("reset_demo");
  });

  it("does not reset a signed-out visitor when the demo shopper is not configured", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_not_ready" });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops when the reset limiter says no", async () => {
    allowReset.mockResolvedValue(false);
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(429);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes returned photo paths through the storage API", async () => {
    rpc.mockResolvedValue({ data: ["demo/one.jpg", ""], error: null });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(["demo/one.jpg"]);
  });
});
