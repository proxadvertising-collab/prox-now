import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerToolsOpen } from "../../../lib/owner/claim";
import { POST as claim } from "./claim/route";
import { POST as keep } from "./keep/route";
import { POST as pass } from "./pass/route";
import { POST as redeem } from "./redeem/route";

const { getUser, rpc, remove, spark, shopRow, demoRows, serviceRpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  spark: vi.fn(),
  shopRow: { current: null as { name: string; lat: number; lng: number; claim_code?: string; is_demo?: boolean } | null },
  demoRows: { current: [] as { role: string }[] },
  serviceRpc: vi.fn(),
}));

vi.mock("../../../lib/ai/meta", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/ai/meta")>("../../../lib/ai/meta");
  return { ...actual, callSpark: spark };
});

vi.mock("../../../lib/supabase/admin", () => ({
  createServiceClient: () => ({ rpc: serviceRpc }),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    storage: { from: () => ({ remove }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: async () => ({ data: demoRows.current, error: null }),
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
    serviceRpc.mockReset();
    shopRow.current = null;
    demoRows.current = [];
    getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    serviceRpc.mockImplementation(async (name: string) => {
      if (name === "consume_claim_capture") return { data: true, error: null };
      if (name === "issue_claim_capture") return { data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", error: null };
      return { data: "verified", error: null };
    });
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

  it("claims a shop as pending and issues a code", async () => {
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await call("/api/owner/claim", { shopId: "11111111-1111-4111-8111-111111111111" }, claim);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; status: string; code: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.code).toMatch(/^[a-z]+ \d{4}$/);
    expect(rpc).toHaveBeenCalledWith("open_claim", {
      p_shop_id: "11111111-1111-4111-8111-111111111111",
      p_code: body.code,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("rejects a no-code claim on a real shop", async () => {
    shopRow.current = { name: "Real Cafe", lat: 12.56, lng: 99.95, is_demo: false };
    demoRows.current = [{ role: "owner" }];
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await call("/api/owner/claim", { shopId: "11111111-1111-4111-8111-111111111111" }, claim);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; demo?: boolean };
    expect(body.status).toBe("pending");
    expect(body.demo).toBeUndefined();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("verifies a demo café without a paper code for a demo owner", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.56, lng: 99.95, is_demo: true };
    demoRows.current = [{ role: "owner" }];
    rpc.mockResolvedValue({ data: "pending", error: null });
    const response = await call("/api/owner/claim", { shopId: "11111111-1111-4111-8111-111111111111" }, claim);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "verified", demo: true });
    expect(serviceRpc).toHaveBeenCalledWith("verify_claim", {
      p_shop_id: "11111111-1111-4111-8111-111111111111",
      p_user_id: "user",
    });
  });

  function proof(lat: string, lng: string, capture = true) {
    const form = new FormData();
    form.set("shopId", "11111111-1111-4111-8111-111111111111");
    form.set("lat", lat);
    form.set("lng", lng);
    form.set("code", "mango 1234");
    form.set("image", new File([Uint8Array.from([1, 2, 3])], "sign.jpg", { type: "image/jpeg" }));
    if (capture) form.set("capture", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    form.set("live", "1");
    return claim(
      new Request("http://localhost/api/owner/claim", {
        method: "POST",
        body: form,
      }),
    );
  }

  it("rejects a matching photo when the capture token is missing", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575, claim_code: "mango 1234" };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await proof("12.5685", "99.9575", false);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_capture" });
    expect(spark).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("verifies when the sign matches", async () => {
    shopRow.current = { name: 'Mala "Mafia"', lat: 12.5685, lng: 99.9575, claim_code: "mango 1234" };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await proof("12.5685", "99.9575");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "verified" });
    expect(spark).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('Mala \\"Mafia\\"') }));
    expect(spark).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("mango 1234") }));
    expect(rpc).not.toHaveBeenCalledWith("verify_claim", expect.anything());
    expect(serviceRpc).toHaveBeenCalledWith("verify_claim", {
      p_shop_id: "11111111-1111-4111-8111-111111111111",
      p_user_id: "user",
    });
    expect(ownerToolsOpen([{ status: "verified" }])).toBe(true);
  });

  it("rejects a spoofed GPS even when the photo matches and a token is sent", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575, claim_code: "mango 1234" };
    spark.mockResolvedValue({ raw: '{"match":true}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await proof("13.8", "100.5");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "too_far" });
    expect(spark).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("stays in review when GPS is at the shop, live is set, and the photo does not match", async () => {
    shopRow.current = { name: "Mala Mafia", lat: 12.5685, lng: 99.9575, claim_code: "mango 1234" };
    spark.mockResolvedValue({ raw: '{"match":false}', model: "muse-spark-1.3", ms: 1 });
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await proof("12.5685", "99.9575");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "in_review",
      reason: "not_confirmed",
      message: "We'll review this within 48 hours",
    });
    expect(rpc).toHaveBeenCalledWith("mark_claim_review", { p_shop_id: "11111111-1111-4111-8111-111111111111" });
    expect(serviceRpc).not.toHaveBeenCalledWith("verify_claim", expect.anything());
  });
});
