import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { list } = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => list(),
      }),
    }),
  }),
}));

describe("GET /api/shops/near", () => {
  beforeEach(() => {
    list.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  it("returns shops within 5 km of the phone and drops demo shops already filtered", async () => {
    list.mockResolvedValue({
      data: [
        {
          id: "near",
          slug: "near",
          name: "Near",
          name_local: null,
          category: "other",
          lat: 12.5684,
          lng: 99.9577,
          is_demo: false,
        },
        {
          id: "far",
          slug: "far",
          name: "Far",
          name_local: null,
          category: "other",
          lat: 13.2,
          lng: 99.9577,
          is_demo: false,
        },
      ],
      error: null,
    });
    const response = await GET(new Request("http://localhost/api/shops/near?lat=12.5684&lng=99.9577"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.shops.map((shop: { id: string }) => shop.id)).toEqual(["near"]);
  });

  it("rejects a bad location", async () => {
    const response = await GET(new Request("http://localhost/api/shops/near?lat=nope&lng=1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_location" });
    expect(list).not.toHaveBeenCalled();
  });
});
