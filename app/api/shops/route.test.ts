import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
  }),
}));

const good = {
  name: "Mala House",
  nameLocal: "หม่าล่า",
  category: "street_food",
  lat: 12.5684,
  lng: 99.9577,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/shops", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
  });

  it("returns 401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await post(good);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not_signed_in" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the created shop", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    rpc.mockResolvedValue({
      data: {
        id: "shop-1",
        slug: "mala-house-abc123",
        name: "Mala House",
        name_local: "หม่าล่า",
        category: "street_food",
        lat: 12.5684,
        lng: 99.9577,
      },
      error: null,
    });
    const response = await post(good);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shop.name).toBe("Mala House");
    expect(body.shop.id).toBe("shop-1");
    expect(rpc).toHaveBeenCalledWith(
      "create_shop_from_snap",
      expect.objectContaining({ p_name: "Mala House", p_lat: 12.5684 }),
    );
  });

  it("maps rate_limited", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: "rate_limited" } });
    const response = await post(good);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("rejects a short name", async () => {
    const response = await post({ ...good, name: "A" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_input" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
