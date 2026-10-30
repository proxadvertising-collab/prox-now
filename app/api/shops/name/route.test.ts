import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
  }),
}));

const SHOP = "11111111-1111-4111-8111-111111111111";

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/shops/name", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/shops/name", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "creator" } }, error: null });
    rpc.mockResolvedValue({ data: "Mala Mafia", error: null });
  });

  it("saves the name for the creator or verified owner", async () => {
    const response = await call({ shopId: SHOP, name: "  Mala Mafia  " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, name: "Mala Mafia" });
    expect(rpc).toHaveBeenCalledWith("set_shop_name", { p_shop_id: SHOP, p_name: "Mala Mafia" });
  });

  it("rejects someone who is not the creator or owner", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    const response = await call({ shopId: SHOP, name: "Other" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_allowed" });
  });

  it("rejects a signed-out caller", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await call({ shopId: SHOP, name: "Mala" });
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});