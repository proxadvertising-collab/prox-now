import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { from, select, not, eq, gt, order, limit } = vi.hoisted(() => {
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const gt = vi.fn();
  const eq = vi.fn();
  const not = vi.fn();
  const select = vi.fn();
  const from = vi.fn(() => ({ select }));
  return { from, select, not, eq, gt, order, limit };
});

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => undefined };
});

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

function chain(rows: unknown[]) {
  const api = {
    select,
    not,
    eq,
    gt,
    order,
    limit,
  };
  select.mockReturnValue(api);
  not.mockReturnValue(api);
  eq.mockReturnValue(api);
  gt.mockReturnValue(api);
  order.mockReturnValue(api);
  limit.mockResolvedValue({ data: rows, error: null });
}

describe("GET /api/places/export", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    from.mockClear();
    select.mockClear();
    not.mockClear();
    eq.mockClear();
    gt.mockClear();
    order.mockClear();
    limit.mockReset();
  });

  it("returns user shops as GeoJSON and never the author", async () => {
    chain([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Mala House",
        name_local: null,
        category: "street_food",
        lat: 12.5,
        lng: 99.9,
        country_code: "US",
        address_hint: null,
        phone_public: null,
        created_at: "2026-10-27T00:00:00.000Z",
        timezone: "America/New_York",
        currency: "USD",
        claimed: false,
      },
    ]);
    const response = await GET(new Request("http://localhost/api/places/export?country=us&since=2026-10-01"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
    const body = await response.json();
    const dumped = JSON.stringify(body);
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(1);
    expect(body.features[0].geometry.coordinates).toEqual([99.9, 12.5]);
    expect(dumped).not.toContain("created_by");
    expect(dumped).not.toContain("email");
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("created_by"));
    expect(eq).toHaveBeenCalledWith("country_code", "US");
    expect(gt).toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(5000);
  });

  it("rejects a bad country filter", async () => {
    const response = await GET(new Request("http://localhost/api/places/export?country=USA"));
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});
