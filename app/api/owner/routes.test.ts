import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerToolsOpen } from "../../../lib/owner/claim";
import { POST as claim } from "./claim/route";
import { POST as keep } from "./keep/route";
import { POST as pass } from "./pass/route";
import { POST as redeem } from "./redeem/route";

const { getUser, rpc, remove, spark, shopRow } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  spark: vi.fn(),
  shopRow: { current: null as { name: string; lat: number; lng: number } | null },
}));

vi.mock("../../../lib/ai/meta", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/ai/meta")>("../../../lib/ai/meta");
  return { ...actual, callSpark: spark };
});

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    storage: { from: () => ({ remove }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: shopRow.current, error: shopRow.current ? null : { message: "missing" } }),
      };
      return query;
    },
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
    spark.mockReset();
    shopRow.current = null;
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

  function proof(lat: string, lng: string) {
    const form = new FormData();
    form.set("shopId", "11111111-1111-4111-8111-111111111111");
    form.set("lat", lat);
    form.set("lng", lng);
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "sign.jpg", { type: "image/jpeg" }));
    form.set("live", "1");
    return claim(
      new Request("http://localhost/api/owner/claim", {
        method: "POST",
        body: form,
      }),
    );
  }

  it("stays pending when the photo was not taken with the live camera", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575 };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: "pending", error: null });
    const form = new FormData();
    form.set("shopId", "11111111-1111-4111-8111-111111111111");
    form.set("lat", "12.5685");
    form.set("lng", "99.9575");
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "sign.jpg", { type: "image/jpeg" }));
    const response = await claim(new Request("http://localhost/api/owner/claim", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "pending", reason: "not_confirmed" });
    expect(spark).not.toHaveBeenCalled();
  });

  it("verifies when the device is at the shop and the sign matches", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575 };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockImplementation(async (name: string) => {
      if (name === "verify_claim") return { data: "verified", error: null };
      return { data: "pending", error: null };
    });
    const response = await proof("12.5685", "99.9575");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "verified" });
    expect(rpc).toHaveBeenCalledWith("verify_claim", { p_shop_id: "11111111-1111-4111-8111-111111111111" });
    expect(ownerToolsOpen([{ status: "verified" }])).toBe(true);
  });

  it("stays pending when the device is far from the shop", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575 };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await proof("13.8", "100.5");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "pending", reason: "not_confirmed" });
    expect(spark).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("claim_shop", { p_shop_id: "11111111-1111-4111-8111-111111111111" });
    expect(ownerToolsOpen([{ status: "pending" }])).toBe(false);
  });

  it("stays pending when the photo is not this shop", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575 };
    spark.mockResolvedValue({ raw: '{"match":false}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await proof("12.5685", "99.9575");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "pending", reason: "not_confirmed" });
    expect(rpc).toHaveBeenCalledWith("claim_shop", { p_shop_id: "11111111-1111-4111-8111-111111111111" });
    expect(rpc).not.toHaveBeenCalledWith("verify_claim", expect.anything());
  });
});
