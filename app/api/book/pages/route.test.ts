import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_RESTING_MESSAGE } from "../../../../lib/book/message";
import { contrastRatio, MIN_CONTRAST, SURFACE } from "../../../../lib/book/palette";
import { SNAP_USER_LIMIT, allowSnap, resetRateWindows } from "../../../../lib/rate/window";
import { POST } from "./route";

const SECRET = "test-meta-key";
const SERVICE = "test-service-key";
const SHOP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

const { getUser, state, service } = vi.hoisted(() => {
  const state = {
    shop: null as { id: string; category: string } | null,
    book: null as Row | null,
    pages: [] as Row[],
    uploads: [] as { path: string; bytes: Buffer }[],
    removed: [] as string[],
    missing: [] as string[],
    uploadError: false,
    pageInsertError: null as { message: string; code?: string } | null,
    shopError: null as { message: string } | null,
  };
  const getUser = vi.fn();

  class Query {
    table: string;
    op = "select";
    payload: unknown = null;

    constructor(table: string) {
      this.table = table;
    }

    select() {
      return this;
    }

    eq() {
      return this;
    }

    insert(payload: unknown) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: unknown) {
      this.op = "update";
      this.payload = payload;
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.finish());
    }

    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.finish()).then(resolve, reject);
    }

    finish() {
      if (this.table === "shops") return { data: state.shop, error: state.shopError };
      if (this.table === "shop_book_pages" && this.op === "select") {
        return { data: state.pages.filter((page) => page.status === "live"), error: null };
      }
      if (this.table === "shop_book_pages" && this.op === "insert") {
        if (state.pageInsertError) return { data: null, error: state.pageInsertError };
        const rows = Array.isArray(this.payload) ? (this.payload as Row[]) : [this.payload as Row];
        state.pages.push(...rows);
        return { data: rows, error: null };
      }
      if (this.table === "shop_books" && this.op === "select") return { data: state.book, error: null };
      if (this.table === "shop_books" && (this.op === "insert" || this.op === "update")) {
        state.book = { ...(state.book ?? {}), ...(this.payload as Row) };
        return { data: state.book, error: null };
      }
      return { data: null, error: null };
    }
  }

  const service = {
    from(table: string) {
      return new Query(table);
    },
    storage: {
      from() {
        return {
          upload: async (path: string, bytes: Buffer) => {
            if (state.uploadError) return { data: null, error: { message: "disk" } };
            state.uploads.push({ path, bytes: Buffer.from(bytes) });
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            state.removed.push(...paths);
            return { data: null, error: null };
          },
        };
      },
    },
    rpc: async () => ({ data: state.missing, error: null }),
  };

  return { getUser, state, service };
});

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createServiceClient: () => service,
}));

let mode = "ok";

function metaResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      id: "call_test",
      model: "muse-spark-1.3-live",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function installFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body));
    const content = sent.input[0].content as { type: string; text?: string }[];
    const prompt = content.find((part) => part.type === "input_text")?.text ?? "";
    const indexes = content
      .filter((part) => part.text?.startsWith("Image "))
      .map((part) => Number(String(part.text).replace("Image ", "").replace(":", "")));
    if (prompt.includes("Find every human face")) {
      if (mode === "blur") return metaResponse(JSON.stringify({ pages: indexes.map((index) => ({ index })) }));
      const faces = mode === "face" ? [[0.4, 0.4, 0.6, 0.6]] : [];
      return metaResponse(JSON.stringify({ pages: indexes.map((index) => ({ index, faces })) }));
    }
    if (mode === "rest") return new Response("rate limit", { status: 429 });
    return metaResponse(
      JSON.stringify({
        pages: indexes.map((index) => ({
          index,
          kind_guess: "menu",
          is_menu: mode !== "notmenu",
          language: "th",
          section: "Noodles",
          items: [{ name: "Pad Thai", price: "50", currency: "THB", note: null }],
          hours: { days: [{ d: "mon", open: "08:00", close: "17:00" }], raw: "Mon 8-5" },
        })),
        shop_language: "th",
        tagline_facts: ["Pad Thai", "best in town"],
      }),
    );
  });
}

async function jpegFile(name = "page.jpg"): Promise<File> {
  const buf = await sharp({
    create: { width: 48, height: 32, channels: 3, background: { r: 220, g: 80, b: 20 } },
  })
    .jpeg()
    .toBuffer();
  const copy = Uint8Array.from(buf);
  return new File([copy.buffer], name, { type: "image/jpeg" });
}

async function postPages(count = 1, fields?: Record<string, string>, files?: File[]) {
  const form = new FormData();
  form.set("shop", fields?.shop ?? "mala-mafia");
  form.set("kind", fields?.kind ?? "menu");
  const chosen = files ?? (await Promise.all(Array.from({ length: count }, (_, index) => jpegFile("page-" + index + ".jpg"))));
  for (const file of chosen) form.append("files", file);
  return POST(
    new Request("http://localhost/api/book/pages", {
      method: "POST",
      body: form,
      headers: { "x-forwarded-for": "203.0.113.8" },
    }),
  );
}

function contentCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => {
    const sent = JSON.parse(String(call[1]?.body));
    const prompt = sent.input[0].content[0].text as string;
    return prompt.startsWith("Read the REAL text");
  });
}

describe("POST /api/book/pages", () => {
  beforeEach(() => {
    resetRateWindows();
    vi.stubEnv("META_API_KEY", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE);
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    state.shop = { id: SHOP, category: "street_food" };
    state.book = null;
    state.pages = [];
    state.uploads = [];
    state.removed = [];
    state.missing = ["storefront", "logo", "hours", "qr"];
    state.uploadError = false;
    state.pageInsertError = null;
    state.shopError = null;
    mode = "ok";
    vi.stubGlobal("fetch", installFetch());
  });

  it("rejects a signed-out caller before any read", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no" } });
    const response = await postPages();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "not_signed_in" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.uploads).toHaveLength(0);
  });

  it("rate limits with the snap bucket and does not call Meta", async () => {
    for (let hit = 0; hit < SNAP_USER_LIMIT; hit += 1) {
      expect(await allowSnap("203.0.113.8", USER)).toBe(true);
    }
    const response = await postPages();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.uploads).toHaveLength(0);
  });

  it("rejects a bad image, an oversized file, a second logo, and a 13th menu page", async () => {
    const text = new File([Uint8Array.from([1, 2, 3])], "notes.txt", { type: "text/plain" });
    const bad = await postPages(1, undefined, [text]);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_image" });

    const big = new File([new Uint8Array(1_048_577)], "big.jpg", { type: "image/jpeg" });
    const oversized = await postPages(1, undefined, [big]);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "too_big" });

    state.pages = [{ kind: "logo", status: "live" }];
    const again = await postPages(1, { kind: "logo" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "already_there" });

    state.pages = Array.from({ length: 11 }, () => ({ kind: "menu", status: "live" }));
    const limited = await postPages(2);
    expect(limited.status).toBe(409);
    expect(await limited.json()).toEqual({ error: "page_limit" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.uploads).toHaveLength(0);
  });

  it("reads five menu pages in one Meta call after blurring", async () => {
    const response = await postPages(5);
    const body = await response.json();
    expect(response.status).toBe(200);
    const fetchMock = vi.mocked(fetch);
    const reads = contentCalls(fetchMock);
    expect(reads).toHaveLength(1);
    const sent = JSON.parse(String(reads[0]?.[1]?.body));
    const images = sent.input[0].content.filter((part: { type: string }) => part.type === "input_image");
    expect(images).toHaveLength(5);
    expect(sent.store).toBe(false);
    expect(sent.reasoning).toEqual({ effort: "low" });
    expect(sent.max_output_tokens).toBe(1300);
    expect(body.ai).toMatchObject({
      model: "muse-spark-1.3-live",
      calls: 1,
      images_in_call: 5,
      face_calls: 1,
    });
    expect(body.missing).toEqual(["storefront", "logo", "hours", "qr"]);
    expect(body.pages).toHaveLength(5);
    expect(state.uploads).toHaveLength(5);
    expect(state.pages[0]?.extracted).toEqual({
      section: "Noodles",
      items: [{ name: "Pad Thai", price: "50", currency: "THB", note: null }],
    });
    expect(state.pages[0]?.ai_meta).toMatchObject({
      model: "muse-spark-1.3-live",
      images_in_call: 5,
      call_id: "call_test",
      faces_blurred: 0,
    });
    expect(state.book).toMatchObject({ status: "live", tagline: "Pad Thai", source_language: "th", built_by_model: "muse-spark-1.3-live" });
    expect(JSON.stringify(body).includes(SECRET)).toBe(false);
    expect(JSON.stringify(body).includes(SERVICE)).toBe(false);
  });

  it("stores a blurred face and a palette from the logo photo", async () => {
    mode = "face";
    const response = await postPages(1, { kind: "logo" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.pages[0]?.ai_meta).toMatchObject({ faces_blurred: 1 });
    const theme = state.book?.theme as { accent: string; ink: string };
    expect(contrastRatio(theme.accent, SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(theme.ink, theme.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(body.ai.model).toBe("muse-spark-1.3-live");
  });

  it("stores nothing when the face check fails", async () => {
    mode = "blur";
    const response = await postPages();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "blur_failed" });
    expect(state.uploads).toHaveLength(0);
    expect(state.pages).toHaveLength(0);
    expect(state.book).toBeNull();
  });

  it("keeps the blurred photos when Meta is resting", async () => {
    mode = "rest";
    const response = await postPages();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error).toBe("ai_resting");
    expect(body.message).toBe(AI_RESTING_MESSAGE);
    expect(state.uploads).toHaveLength(1);
    expect(state.removed).toHaveLength(0);
    expect(state.pages[0]?.extracted).toEqual({});
    expect(body.pages).toHaveLength(1);
  });

  it("removes the upload when the photo is not a menu", async () => {
    mode = "notmenu";
    const response = await postPages();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_a_menu" });
    expect(state.uploads).toHaveLength(1);
    expect(state.removed).toEqual([state.uploads[0]?.path]);
    expect(state.pages).toHaveLength(0);
    expect(state.book).toBeNull();
  });

  it("refuses a new photo while the book is hidden and leaves it hidden", async () => {
    state.book = {
      status: "hidden",
      hours: { days: [{ d: 1, open: "09:00", close: "12:00" }], raw: null, source: "owner" },
      theme: {},
      tagline: "Kept",
      source_language: "en",
      built_by_model: "older-model",
    };
    const response = await postPages(1, { kind: "hours" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "book_hidden" });
    expect(state.uploads).toHaveLength(0);
    expect(state.pages).toHaveLength(0);
    expect(state.book?.status).toBe("hidden");
    expect(state.book?.hours).toMatchObject({ source: "owner", days: [{ open: "09:00" }] });
  });
});
