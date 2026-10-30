import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateWindows } from "../../../../lib/rate/window";
import { POST } from "./route";

const { getUser, signInWithPassword, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, signInWithPassword },
    rpc,
  }),
}));

describe("POST /api/judge/reset", () => {
  beforeEach(() => {
    resetRateWindows();
    getUser.mockReset();
    signInWithPassword.mockReset();
    rpc.mockReset();
    vi.stubEnv("DEMO_EXPLORER_EMAIL", "demo-shopper@example.com");
    vi.stubEnv("DEMO_EXPLORER_PASSWORD", "demo-secret");
    getUser.mockResolvedValue({ data: { user: { id: "demo" } }, error: null });
    signInWithPassword.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("resets for a demo account and does not sign them in again", async () => {
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/snap" });
    expect(rpc).toHaveBeenCalledWith("reset_demo");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a signed-in person who is not a demo account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "captain" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: "not_demo" } });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_demo" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs a new visit into the demo shopper before resetting", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "demo-shopper@example.com",
      password: "demo-secret",
    });
    expect(rpc).toHaveBeenCalledWith("reset_demo");
  });

  it("does not reset when a new visit has no demo sign-in", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.stubEnv("DEMO_EXPLORER_EMAIL", "");
    vi.stubEnv("DEMO_EXPLORER_PASSWORD", "");
    const response = await POST(new Request("http://localhost/api/judge/reset", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
