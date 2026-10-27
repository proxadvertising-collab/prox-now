import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as claim } from "./claim/route";
import { POST as keep } from "./keep/route";
import { POST as pass } from "./pass/route";
import { POST as redeem } from "./redeem/route";

const { getUser, rpc, remove } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    storage: { from: () => ({ remove }) },
  }),
}));

const POST_ID = "33333333-3333-4333-8333-333333333333";

function call(path: string, body: unknown, handler: (request: Request) => Promise<Response>) {
  return handler(
    new Request("http://localhost" + path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("owner routes", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    remove.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    remove.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await call("/api/owner/keep", { id: POST_ID }, keep);
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not a verified owner" } });
    const response = await call("/api/owner/keep", { id: POST_ID }, keep);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_owner" });
  });

  it("keeps a ready post", async () => {
    rpc.mockResolvedValue({ data: "coupon-1", error: null });
    const response = await call("/api/owner/keep", { id: POST_ID }, keep);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, couponId: "coupon-1" });
  });

  it("leaves the post undecided when storage delete fails", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "pass_post_begin") return { data: "user/photo.jpg", error: null };
      return { data: null, error: null };
    });
    remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    const response = await call("/api/owner/pass", { id: POST_ID }, pass);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "storage_failed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("pass_post_begin", { p_post_id: POST_ID });
  });

  it("redeems a code for the owner", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, shop_id: "shop", holder_name: "Mai", expires_at: "2026-10-28T00:00:00.000Z" },
      error: null,
    });
    const response = await call("/api/owner/redeem", { code: "ABCD123456" }, redeem);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("redeem_coupon", { p_code: "ABCD123456" });
  });

  it("claims a shop as pending", async () => {
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await call("/api/owner/claim", { shopId: "11111111-1111-4111-8111-111111111111" }, claim);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "pending" });
  });
});
