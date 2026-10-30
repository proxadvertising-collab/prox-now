import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
  }),
}));

const SHOP = "11111111-1111-4111-8111-111111111111";

function call() {
  return POST(
    new Request("http://localhost/api/owner/claim/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopId: SHOP }),
    }),
  );
}

describe("POST /api/owner/claim/cancel", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("deletes the caller's pending claim", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("cancel_claim", { p_shop_id: SHOP });
  });

  it("rejects a signed-out caller", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await call();
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves a verified row alone", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    const response = await call();
    expect(response.status).toBe(404);
  });
});