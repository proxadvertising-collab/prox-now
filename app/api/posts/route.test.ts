import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, maybeSingle, upload, remove, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
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
});
