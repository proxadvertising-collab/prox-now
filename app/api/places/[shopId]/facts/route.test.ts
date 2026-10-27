import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { limit } = vi.hoisted(() => ({
  limit: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => undefined };
});

vi.mock("../../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit }),
        }),
      }),
    }),
  }),
}));

const SHOP = "11111111-1111-4111-8111-111111111111";

describe("GET /api/places/[shopId]/facts", () => {
  beforeEach(() => {
    limit.mockReset();
  });

  it("returns the latest anonymous facts and drops captions", async () => {
    limit.mockResolvedValue({
      data: [
        {
          observed_at: "2026-10-27T00:00:00.000Z",
          facts: { items: [{ name: "Tea", price: 20, currency: "THB" }], caption: "secret", captions: { en: "no" } },
        },
      ],
      error: null,
    });
    const response = await GET(new Request("http://localhost/api/places/" + SHOP + "/facts"), {
      params: Promise.resolve({ shopId: SHOP }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.facts[0].caption).toBeUndefined();
    expect(body.facts[0].items[0].name).toBe("Tea");
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
  });
});
