import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, rpc, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from,
  }),
}));

const POST_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";

describe("suggest coupon", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
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
});
