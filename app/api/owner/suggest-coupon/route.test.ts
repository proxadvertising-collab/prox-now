import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc, from, createSignedUrl, suggestCouponOffer } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  suggestCouponOffer: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from,
  }),
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

vi.mock("../../../../lib/coupon/suggest", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/coupon/suggest")>("../../../../lib/coupon/suggest");
  return { ...actual, suggestCouponOffer };
});

const POST_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";

describe("suggest coupon", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    createSignedUrl.mockReset();
    suggestCouponOffer.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    from.mockImplementation((table: string) => {
      if (table === "posts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: POST_ID, shop_id: SHOP_ID, photo_path: "user/photo.jpg" },
                error: null,
              }),
            }),
          }),
        };
      }
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: [], error: null });
        },
      };
      return query;
    });
  });

  it("rejects someone who is not a verified owner", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(
      new Request("http://localhost/api/owner/suggest-coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: POST_ID }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_owner" });
    expect(rpc).toHaveBeenCalledWith("is_verified_owner", { p_shop_id: SHOP_ID });
  });

  it("signs the post photo with the service client before reading it", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    suggestCouponOffer.mockResolvedValue("free tea");
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/storage/v1/object/sign/post-photos/user/photo.jpg?token=abc" },
    });
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await POST(
        new Request("http://localhost/api/owner/suggest-coupon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ post_id: POST_ID }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ offer: "free tea" });
      expect(createSignedUrl).toHaveBeenCalledWith("user/photo.jpg", expect.any(Number));
      const fetched = String(fetchMock.mock.calls[0]?.[0]);
      expect(fetched).toContain("token=abc");
      expect(fetched).not.toContain("/api/media");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
