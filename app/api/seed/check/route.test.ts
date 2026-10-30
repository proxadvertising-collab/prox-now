import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getUser, allowSnap, callSparkImages } = vi.hoisted(() => ({
  getUser: vi.fn(),
  allowSnap: vi.fn(),
  callSparkImages: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("../../../../lib/rate/window", () => ({
  allowSnap,
  clientIp: () => "203.0.113.9",
}));

vi.mock("../../../../lib/ai/meta", () => ({
  callSparkImages,
}));

const clean = {
  sharp: true,
  duplicate_of: null,
  contains: ["logo"],
  name_guess: "Cafe",
  next_tip_en: "Shoot the main menu board with prices.",
  next_tip_th: "ถ่ายเมนูหลักที่มีราคา",
};

async function shotRequest(): Promise<Request> {
  const raw = Buffer.alloc(8 * 8 * 3, 80);
  const jpeg = await sharp(raw, { raw: { width: 8, height: 8, channels: 3 } }).jpeg().toBuffer();
  const form = new FormData();
  form.set("image", new File([jpeg], "shot.jpg", { type: "image/jpeg" }));
  form.set("previous", JSON.stringify([{ index: 1, contains: ["logo"] }]));
  form.set("index", "2");
  return new Request("http://localhost/api/seed/check", { method: "POST", body: form });
}

describe("seed check", () => {
  beforeEach(() => {
    getUser.mockReset();
    allowSnap.mockReset();
    callSparkImages.mockReset();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    allowSnap.mockResolvedValue(true);
  });

  it("rejects a signed-out caller", async () => {
    const response = await POST(await shotRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not_signed_in" });
    expect(allowSnap).not.toHaveBeenCalled();
    expect(callSparkImages).not.toHaveBeenCalled();
  });

  it("reuses the snap rate limit", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    allowSnap.mockResolvedValue(false);
    const response = await POST(await shotRequest());
    expect(response.status).toBe(429);
    expect(allowSnap).toHaveBeenCalledWith("203.0.113.9", "user-1");
    expect(callSparkImages).not.toHaveBeenCalled();
  });

  it("sends one coach image and returns the parsed read", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    callSparkImages.mockResolvedValue({ raw: clean, usage: null, ms: 1, model: "muse-spark-1.3", callId: null });
    const response = await POST(await shotRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(clean);
    expect(callSparkImages).toHaveBeenCalledTimes(1);
    const input = callSparkImages.mock.calls[0][0] as {
      prompt: string;
      images: { imageDataUrl: string }[];
      maxOutputTokens: number;
    };
    expect(input.images).toHaveLength(1);
    expect(input.images[0].imageDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(input.maxOutputTokens).toBe(400);
    expect(input.prompt).toContain("Photo 1: logo");
  });

  it("returns null when the model throws", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    callSparkImages.mockRejectedValue(new Error("down"));
    const response = await POST(await shotRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("returns null when the coach call exceeds 4 seconds", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    callSparkImages.mockImplementation(() => new Promise(() => undefined));
    const response = await POST(await shotRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  }, 10_000);
});
