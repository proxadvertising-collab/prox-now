import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, signOut, rpc, remove, allowReset } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
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
    auth: { getUser, signOut },
    rpc,
  }),
}));

function exit(cookie?: string) {
  return POST(
    new Request("http://localhost/api/judge/exit", {
      method: "POST",
      headers: cookie ? { cookie } : {},
    }),
  );
}

function expired(response: Response) {
  return response.headers.getSetCookie().map((row) => row.toLowerCase());
}

describe("POST /api/judge/exit", () => {
  beforeEach(() => {
    getUser.mockReset();
    signOut.mockReset();
    rpc.mockReset();
    remove.mockReset();
    allowReset.mockReset();
    allowReset.mockResolvedValue(true);
    getUser.mockResolvedValue({ data: { user: { id: "demo" } }, error: null });
    signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: ["demo/one.jpg"], error: null });
    remove.mockResolvedValue({ data: null, error: null });
  });

  it("resets a demo session, then signs out and expires both cookies", async () => {
    const order: string[] = [];
    rpc.mockImplementation(async () => {
      order.push("reset");
      return { data: ["demo/one.jpg"], error: null };
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    const response = await exit("prox-judge=explorer");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/judge", reset: true });
    expect(order).toEqual(["reset", "signOut"]);
    expect(rpc).toHaveBeenCalledWith("reset_demo");
    expect(remove).toHaveBeenCalledWith(["demo/one.jpg"]);
    const rows = expired(response);
    expect(rows.some((row) => row.startsWith("prox-judge=") && row.includes("max-age=0"))).toBe(true);
    expect(rows.some((row) => row.startsWith("prox-demo=") && row.includes("max-age=0"))).toBe(true);
  });

  it("skips the reset when the session is not a demo", async () => {
    const response = await exit();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/judge", reset: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("signs out when the reset is refused, fails, or is rate limited", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_demo" } });
    const refused = await exit("prox-demo=1");
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ ok: true, next: "/judge", reset: false });
    expect(signOut).toHaveBeenCalledOnce();

    signOut.mockClear();
    rpc.mockRejectedValue(new Error("storage down"));
    const failed = await exit("prox-judge=owner");
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual({ ok: true, next: "/judge", reset: false });
    expect(signOut).toHaveBeenCalledOnce();

    signOut.mockClear();
    rpc.mockClear();
    allowReset.mockResolvedValue(false);
    const limited = await exit("prox-judge=explorer");
    expect(limited.status).toBe(200);
    expect(await limited.json()).toEqual({ ok: true, next: "/judge", reset: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
    const rows = expired(limited);
    expect(rows.some((row) => row.startsWith("prox-judge=") && row.includes("max-age=0"))).toBe(true);
    expect(rows.some((row) => row.startsWith("prox-demo=") && row.includes("max-age=0"))).toBe(true);
  });
});
