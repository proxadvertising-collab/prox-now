import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc, remove, allowReset } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  allowReset: vi.fn(),
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
    auth: { getUser },
    rpc,
  }),
}));

describe("POST /api/judge/reset", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    remove.mockReset();
    allowReset.mockReset();
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
    expect(remove).not.toHaveBeenCalled();
    const source = readFileSync(resolve(process.cwd(), "app/api/judge/reset/route.ts"), "utf8");
    expect(source).not.toContain("signInWithPassword");
    expect(source).not.toContain("DEMO_EXPLORER");
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

  it("refuses a signed-out visitor", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not_signed_in" });
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
