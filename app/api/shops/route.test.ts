import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc, shopTimes } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  shopTimes: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => shopTimes(),
        }),
      }),
    }),
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

function mockCreate(result: { data: unknown; error: unknown }) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "nearby_shops") return { data: [], error: null };
    return result;
  });
}

describe("POST /api/shops", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    shopTimes.mockReset();
    shopTimes.mockResolvedValue({ data: [], error: null });
    mockCreate({ data: null, error: null });
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
    mockCreate({
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
      expect.objectContaining({
        p_name: "Mala House",
        p_lat: 12.5684,
        p_country_code: null,
        p_timezone: "Asia/Bangkok",
        p_currency: null,
      }),
    );
  });

  it("passes the edge country, a valid timezone, and the mapped currency", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockCreate({
      data: {
        id: "shop-1",
        slug: "mala-house-abc123",
        name: "Mala House",
        name_local: null,
        category: "street_food",
        lat: 12.5684,
        lng: 99.9577,
      },
      error: null,
    });
    const response = await POST(
      new Request("http://localhost/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vercel-ip-country": "us" },
        body: JSON.stringify({ ...good, timezone: "America/New_York" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_shop_from_snap",
      expect.objectContaining({
        p_country_code: "US",
        p_timezone: "Asia/Bangkok",
        p_currency: "USD",
      }),
    );
  });

  it("uses the browser zone when the point has no IANA zone", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockCreate({
      data: {
        id: "shop-1",
        slug: "ocean-shop",
        name: "Mala House",
        name_local: null,
        category: "street_food",
        lat: 0,
        lng: -40,
      },
      error: null,
    });
    const response = await POST(
      new Request("http://localhost/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...good, lat: 0, lng: -40, timezone: "America/New_York" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_shop_from_snap",
      expect.objectContaining({
        p_lat: 0,
        p_lng: -40,
        p_timezone: "America/New_York",
      }),
    );
  });

  it("maps rate_limited", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockCreate({ data: null, error: { message: "rate_limited" } });
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

  it("stops a fourth new shop inside 24 hours", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const now = Date.now();
    shopTimes.mockResolvedValue({
      data: [1, 2, 3].map((hours) => ({ created_at: new Date(now - hours * 3_600_000).toISOString() })),
      error: null,
    });
    const response = await post(good);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("offers the shop that is already within 25 m instead of creating another", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "nearby_shops") {
        return {
          data: [{ id: "near-1", name: "Other Shop", name_local: null, distance_m: 12 }],
          error: null,
        };
      }
      return { data: { id: "nope", name: "Mala House" }, error: null };
    });
    const response = await post(good);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "shop_exists",
      shops: [{ id: "near-1", name: "Other Shop", nameLocal: null, distanceM: 12 }],
    });
    expect(rpc).not.toHaveBeenCalledWith("create_shop_from_snap", expect.anything());
  });

  it("offers a nearby shop with the same name after folding case and accents", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "nearby_shops") {
        return {
          data: [{ id: "cafe-1", name: "Café House", name_local: null, distance_m: 80 }],
          error: null,
        };
      }
      return { data: { id: "nope", name: "Cafe House" }, error: null };
    });
    const response = await post({ ...good, name: "cafe house" });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("shop_exists");
    expect(body.shops[0].id).toBe("cafe-1");
    expect(rpc).not.toHaveBeenCalledWith("create_shop_from_snap", expect.anything());
  });

  it("creates a shop only when the photo's sign matches the name", async () => {
    vi.stubEnv("META_API_KEY", "test-meta-key");
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: '{"shop_id":null,"confidence":0,"sign_text":[],"quality_score":8,"quality_reason":"sharp sign","faces":[],"category":"drinks","safe_to_post":true,"safe_reason":"","place_name":"Mala House","place_kind":"business","place_confidence":0.91}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mockCreate({
      data: {
        id: "shop-1",
        slug: "mala-house-abc123",
        name: "Mala House",
        name_local: null,
        category: "street_food",
        lat: 12.5684,
        lng: 99.9577,
      },
      error: null,
    });
    const form = new FormData();
    form.set("name", "Mala House");
    form.set("category", "street_food");
    form.set("lat", "12.5684");
    form.set("lng", "99.9577");
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "sign.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("http://localhost/api/shops", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_shop_from_snap",
      expect.objectContaining({ p_name: "Mala House", p_category: "street_food" }),
    );
  });

  it("refuses a photo that does not read as that business", async () => {
    vi.stubEnv("META_API_KEY", "test-meta-key");
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: '{"shop_id":null,"confidence":0,"sign_text":[],"quality_score":8,"quality_reason":"sharp","faces":[],"category":"","safe_to_post":true,"safe_reason":"","place_name":"Dawn Cafe","place_kind":"business","place_confidence":0.9}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const form = new FormData();
    form.set("name", "Mala House");
    form.set("category", "street_food");
    form.set("lat", "12.5684");
    form.set("lng", "99.9577");
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "sign.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("http://localhost/api/shops", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_name" });
    expect(rpc).not.toHaveBeenCalledWith("create_shop_from_snap", expect.anything());
  });

  it("does not create a shop from a public place", async () => {
    vi.stubEnv("META_API_KEY", "test-meta-key");
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: '{"shop_id":null,"confidence":0,"sign_text":[],"quality_score":7,"quality_reason":"beach","faces":[],"category":"","safe_to_post":true,"safe_reason":"","place_name":null,"place_kind":"public","place_confidence":0.8}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const form = new FormData();
    form.set("name", "Beach");
    form.set("category", "other");
    form.set("lat", "12.5684");
    form.set("lng", "99.9577");
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "beach.jpg", { type: "image/jpeg" }));
    const response = await POST(new Request("http://localhost/api/shops", { method: "POST", body: form }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "public_place" });
    expect(rpc).not.toHaveBeenCalledWith("create_shop_from_snap", expect.anything());
  });
});
