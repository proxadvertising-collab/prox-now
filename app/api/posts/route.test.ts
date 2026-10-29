import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { haversineMeters } from "../../../lib/geo";
import { blurFaces } from "../../../lib/image/blur";
import { POST_RADIUS_M } from "../../../lib/snap/place";
import { DELETE, POST } from "./route";

const { getUser, maybeSingle, upload, remove, rpc, demoLimit } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  demoLimit: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === "demo_accounts") return { select: () => ({ limit: demoLimit }) };
      return {
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      };
    },
    storage: {
      from: () => ({ upload, remove }),
    },
    rpc,
  }),
}));

const SHOP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function modelText(faces: number[][]) {
  return JSON.stringify({
    shop_id: SHOP,
    confidence: 0.9,
    sign_text: [{ thai: "ร้าน", english: "Shop" }],
    quality_score: 8,
    quality_reason: "sharp",
    faces,
    category: "other",
    safe_to_post: true,
    safe_reason: "",
  });
}

function sparkResponse(text: string) {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function checkerJpeg(): Promise<Buffer> {
  const width = 80;
  const height = 80;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const on = x < width / 2;
      raw[index] = on ? 230 : 15;
      raw[index + 1] = 20;
      raw[index + 2] = on ? 15 : 230;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function postImage(bytes: Buffer, fields?: Record<string, string>) {
  const form = new FormData();
  const copy = Uint8Array.from(bytes);
  form.set("image", new File([copy.buffer], "snap.jpg", { type: "image/jpeg" }));
  form.set("shopId", fields?.shopId ?? SHOP);
  form.set("lat", fields?.lat ?? "12.5684");
  form.set("lng", fields?.lng ?? "99.9577");
  if (fields?.showFaces) form.set("showFaces", fields.showFaces);
  return POST(
    new Request("http://localhost/api/posts", {
      method: "POST",
      body: form,
    }),
  );
}

describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.stubEnv("META_API_KEY", "test-meta-key");
    getUser.mockReset();
    maybeSingle.mockReset();
    upload.mockReset();
    remove.mockReset();
    rpc.mockReset();
    demoLimit.mockReset();
    demoLimit.mockResolvedValue({ data: [], error: null });
    getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    maybeSingle.mockResolvedValue({
      data: {
        id: SHOP,
        name: "Mala House",
        name_local: "หม่าล่า",
        category: "street_food",
        lat: 12.5684,
        lng: 99.9577,
      },
      error: null,
    });
    upload.mockResolvedValue({ data: { path: "ok" }, error: null });
    remove.mockResolvedValue({ data: null, error: null });
    rpc.mockResolvedValue({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        shop_id: SHOP,
        created_at: "2026-10-26T02:00:00.000Z",
        expires_at: "2026-10-26T04:00:00.000Z",
      },
      error: null,
    });
  });

  it("returns 401 when signed out and uploads nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not_signed_in" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns 400 when the shop is too far", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: SHOP, name: "Far", name_local: null, category: "other", lat: 0, lng: 0 },
      error: null,
    });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "too_far" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not call a demo account too far", async () => {
    demoLimit.mockResolvedValue({ data: [{ role: "owner" }], error: null });
    maybeSingle.mockResolvedValue({
      data: { id: SHOP, name: "Far", name_local: null, category: "other", lat: 0, lng: 0 },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("spark down");
    }));
    const response = await postImage(await checkerJpeg());
    expect(response.status).not.toBe(400);
    expect((await response.json()).error).not.toBe("too_far");
  });

  it("returns 503 and uploads nothing when Spark fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("spark down");
    }));
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "blur_unavailable" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("blurs the face box before upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([[0.4, 0.4, 0.6, 0.6]]))));
    const original = await checkerJpeg();
    const response = await postImage(original);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.facesBlurred).toBe(1);
    expect(body.post.shopId).toBe(SHOP);
    expect(upload).toHaveBeenCalledTimes(1);
    const sent = upload.mock.calls[0]?.[0] as string;
    expect(sent.startsWith(USER + "/")).toBe(true);
    expect(sent.endsWith(".jpg")).toBe(true);
    const uploaded = upload.mock.calls[0]?.[1] as Buffer;
    const before = await sharp(original).raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(uploaded).raw().toBuffer();
    const { width, channels } = before.info;
    const center = (40 * width + 40) * channels;
    const delta = Math.abs(before.data[center] - after[center]) + Math.abs(before.data[center + 2] - after[center + 2]);
    expect(delta).toBeGreaterThan(20);
    expect(body.facesShown).toBe(0);
  });

  async function pixelDelta(left: Buffer, right: Buffer, x: number, y: number) {
    const base = await sharp(left).raw().toBuffer({ resolveWithObject: true });
    const next = await sharp(right).raw().toBuffer();
    const index = (y * base.info.width + x) * base.info.channels;
    return Math.abs(base.data[index] - next[index]) + Math.abs(base.data[index + 2] - next[index + 2]);
  }

  it("keeps every detected face blurred when no face is requested", async () => {
    const top = [0.4, 0.05, 0.6, 0.4];
    const bottom = [0.4, 0.6, 0.6, 0.95];
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([top, bottom]))));
    const original = await checkerJpeg();
    const response = await postImage(original);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.facesShown).toBe(0);
    expect(body.facesBlurred).toBe(2);
    const uploaded = upload.mock.calls[0]?.[1] as Buffer;
    const full = await blurFaces(original, [top, bottom]);
    expect(await pixelDelta(uploaded, full, 40, 18)).toBeLessThan(8);
    expect(await pixelDelta(uploaded, full, 40, 62)).toBeLessThan(8);
  });

  it("leaves a matched face unblurred and ignores a box that matches nothing", async () => {
    const top = [0.4, 0.05, 0.6, 0.4];
    const bottom = [0.4, 0.6, 0.6, 0.95];
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([top, bottom]))));
    const original = await checkerJpeg();
    const matched = await postImage(original, { showFaces: JSON.stringify([top]) });
    expect(matched.status).toBe(200);
    expect((await matched.json()).facesShown).toBe(1);
    const saved = rpc.mock.calls[0]?.[1] as { p_facts?: { consent_shown?: number } };
    expect(saved.p_facts?.consent_shown).toBe(1);
    expect(JSON.stringify(saved.p_facts)).not.toContain("0.4");
    const uploaded = upload.mock.calls[0]?.[1] as Buffer;
    const full = await blurFaces(original, [top, bottom]);
    expect(await pixelDelta(uploaded, full, 40, 18)).toBeGreaterThan(20);
    expect(await pixelDelta(uploaded, full, 40, 62)).toBeLessThan(8);

    upload.mockClear();
    const missed = await postImage(original, { showFaces: JSON.stringify([[0, 0, 0.08, 0.08]]) });
    expect((await missed.json()).facesShown).toBe(0);
    const ignored = upload.mock.calls[0]?.[1] as Buffer;
    expect(await pixelDelta(ignored, full, 40, 18)).toBeLessThan(8);
    expect(await pixelDelta(ignored, full, 40, 62)).toBeLessThan(8);
  });

  it("caps shown faces at two", async () => {
    const faces = [
      [0.42, 0.02, 0.58, 0.22],
      [0.42, 0.4, 0.58, 0.6],
      [0.42, 0.78, 0.58, 0.98],
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText(faces))));
    const original = await checkerJpeg();
    const response = await postImage(original, { showFaces: JSON.stringify(faces) });
    const body = await response.json();
    expect(body.facesShown).toBe(2);
    expect(body.facesBlurred).toBe(1);
    const uploaded = upload.mock.calls[0]?.[1] as Buffer;
    const onlyThird = await blurFaces(original, [faces[2]]);
    const none = await blurFaces(original, []);
    expect(await pixelDelta(uploaded, onlyThird, 40, 70)).toBeLessThan(12);
    expect(await pixelDelta(uploaded, none, 40, 70)).toBeGreaterThan(20);
  });

  it("fails closed when the face read fails even if showFaces is set", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("spark down");
    }));
    const response = await postImage(await checkerJpeg(), { showFaces: JSON.stringify([[0.1, 0.1, 0.4, 0.4]]) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "blur_unavailable" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("maps rate_limited to 429 and removes the upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([]))));
    rpc.mockResolvedValue({ data: null, error: { message: "rate_limited" } });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("maps shop_full to 409 and removes the upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([]))));
    rpc.mockResolvedValue({ data: null, error: { message: "shop_full" } });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "shop_full" });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("still maps an old already_live error to 409", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([]))));
    rpc.mockResolvedValue({ data: null, error: { message: "already_live" } });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_live" });
  });

  it("posts a second photo when create_post accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([]))));
    const first = await postImage(await checkerJpeg());
    expect(first.status).toBe(200);
    rpc.mockResolvedValue({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        shop_id: SHOP,
        created_at: "2026-10-26T02:05:00.000Z",
        expires_at: "2026-10-26T04:05:00.000Z",
      },
      error: null,
    });
    const second = await postImage(await checkerJpeg());
    expect(second.status).toBe(200);
    expect((await second.json()).post.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("saves validated facts from the same Spark call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sparkResponse(
          JSON.stringify({
            shop_id: SHOP,
            confidence: 0.9,
            sign_text: [{ thai: "ร้าน", english: "Shop" }],
            quality_score: 8,
            quality_reason: "sharp",
            faces: [],
            category: "other",
            safe_to_post: true,
            safe_reason: "",
            facts: {
              caption: "Noodles",
              items: [{ name: "Noodle", price: 40, currency: "THB" }],
              crowd: "few",
              open_status: "open",
              signals: ["fresh_batch"],
              sign_language: "th",
              captions: { en: "Noodles", th: "ก๋วยเตี๋ยว" },
            },
          }),
        ),
      ),
    );
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "create_post",
      expect.objectContaining({
        p_facts: expect.objectContaining({
          caption: "Noodles",
          items: [{ name: "Noodle", price: 40, currency: "THB" }],
        }),
      }),
    );
  });

  it("retries without facts when the new function is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => sparkResponse(modelText([]))));
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.create_post in the schema cache" },
      })
      .mockResolvedValueOnce({
        data: {
          id: "33333333-3333-4333-8333-333333333333",
          shop_id: SHOP,
          created_at: "2026-10-26T02:00:00.000Z",
          expires_at: "2026-10-26T04:00:00.000Z",
        },
        error: null,
      });
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty("p_facts");
    expect(remove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("posts a food photo that has no readable sign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sparkResponse(
          JSON.stringify({
            shop_id: SHOP,
            confidence: 0.2,
            sign_text: [],
            quality_score: 1,
            quality_reason: "a plate of food, no shop name",
            faces: [],
            category: "food",
            safe_to_post: true,
            safe_reason: "",
          }),
        ),
      ),
    );
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("still refuses a photo the model says is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sparkResponse(
          JSON.stringify({
            shop_id: SHOP,
            confidence: 0,
            sign_text: [],
            quality_score: 1,
            quality_reason: "too blurry and dark",
            faces: [],
            category: "",
            safe_to_post: true,
            safe_reason: "",
          }),
        ),
      ),
    );
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "photo_unusable" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("rechecks distance from the stored shop and ignores a farther client choice", async () => {
    const origin = { lat: 12.5684, lng: 99.9577 };
    const outsideLat = origin.lat + (POST_RADIUS_M + 25) / ((6_371_000 * Math.PI) / 180);
    expect(haversineMeters(origin, { lat: outsideLat, lng: origin.lng })).toBeGreaterThan(POST_RADIUS_M);
    maybeSingle.mockResolvedValue({
      data: { id: SHOP, name: "Far", name_local: null, category: "other", lat: outsideLat, lng: origin.lng },
      error: null,
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("network disabled");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "too_far" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("lets a shop inside the publish radius reach the photo check", async () => {
    const origin = { lat: 12.5684, lng: 99.9577 };
    const insideLat = origin.lat + (POST_RADIUS_M - 25) / ((6_371_000 * Math.PI) / 180);
    expect(haversineMeters(origin, { lat: insideLat, lng: origin.lng })).toBeLessThanOrEqual(POST_RADIUS_M);
    maybeSingle.mockResolvedValue({
      data: { id: SHOP, name: "Near", name_local: null, category: "other", lat: insideLat, lng: origin.lng },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("spark down");
    }));
    const response = await postImage(await checkerJpeg());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "blur_unavailable" });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/posts", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    remove.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    remove.mockResolvedValue({ data: null, error: null });
  });

  it("returns 403 when the caller is not the author and deletes nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_author" } });
    const response = await DELETE(
      new Request("http://localhost/api/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "33333333-3333-4333-8333-333333333333" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_author" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes the row and the blurred object for the author", async () => {
    rpc.mockResolvedValue({ data: USER + "/photo.jpg", error: null });
    const response = await DELETE(
      new Request("http://localhost/api/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "33333333-3333-4333-8333-333333333333" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith([USER + "/photo.jpg"]);
  });
});
