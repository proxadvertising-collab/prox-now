import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_RESTING_MESSAGE } from "../../../../lib/book/message";
import { contrastRatio, MIN_CONTRAST, SURFACE } from "../../../../lib/book/palette";
import { BOOK_USER_LIMIT, SNAP_USER_LIMIT, allowBook, allowSnap, resetRateWindows } from "../../../../lib/rate/window";
import { POST } from "./route";

const SECRET = "test-meta-key";
const SERVICE = "test-service-key";
const SHOP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

const { getUser, state, service } = vi.hoisted(() => {
  const state = {
    shop: null as { id: string; category: string; name?: string; slug?: string; name_local?: string | null; is_demo?: boolean } | null,
    demoAccount: false,
    book: null as Row | null,
    pages: [] as Row[],
    uploads: [] as { path: string; bytes: Buffer }[],
    removed: [] as string[],
    missing: [] as string[],
    uploadError: false,
    pageInsertError: null as { message: string; code?: string } | null,
    shopError: null as { message: string } | null,
    filters: [] as [string, string, unknown][],
    rpcCalls: [] as string[],
    bookWrites: 0,
    ownerIds: ["22222222-2222-4222-8222-222222222222"] as string[],
  };
  const getUser = vi.fn();

  class Query {
    table: string;
    op = "select";
    payload: unknown = null;

    eqs: [string, unknown][] = [];

    constructor(table: string) {
      this.table = table;
    }

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      state.filters.push([this.table, column, value]);
      this.eqs.push([column, value]);
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
      if (this.table === "demo_accounts") {
        return { data: state.demoAccount ? [{ role: "explorer" }] : [], error: null };
      }
      if (this.table === "shop_owners") {
        return {
          data: state.ownerIds.map((id) => ({ user_id: id, status: "verified" })),
          error: null,
        };
      }
      if (this.table === "shops" && this.op === "update") {
        state.shop = { ...(state.shop ?? { id: "", category: "other" }), ...(this.payload as Row) };
        return { data: state.shop, error: state.shopError };
      }
      if (this.table === "shops") return { data: state.shop, error: state.shopError };
      if (this.table === "shop_book_pages" && this.op === "select") {
        return { data: state.pages.filter((page) => page.status === "live"), error: null };
      }
      if (this.table === "shop_book_pages" && this.op === "update") {
        const id = this.eqs.find((pair) => pair[0] === "id")?.[1];
        const page = state.pages.find((row) => row.id === id);
        if (page) Object.assign(page, this.payload as Row);
        return { data: page ?? null, error: null };
      }
      if (this.table === "shop_book_pages" && this.op === "insert") {
        if (state.pageInsertError) return { data: null, error: state.pageInsertError };
        const rows = Array.isArray(this.payload) ? (this.payload as Row[]) : [this.payload as Row];
        const single = new Set(["storefront", "logo", "hours", "qr"]);
        const seen = new Set<string>();
        for (const page of state.pages) {
          if (page.status === "live" && single.has(String(page.kind))) seen.add(String(page.kind));
        }
        for (const row of rows) {
          if (row.status !== "live" || !single.has(String(row.kind))) continue;
          const kind = String(row.kind);
          if (seen.has(kind)) return { data: null, error: { code: "23505", message: "shop_book_pages_one_live_single_idx" } };
          seen.add(kind);
        }
        state.pages.push(...rows);
        return { data: rows, error: null };
      }
      if (this.table === "shop_books" && this.op === "select") return { data: state.book, error: null };
      if (this.table === "shop_books" && (this.op === "insert" || this.op === "update")) {
        state.bookWrites += 1;
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
    rpc: async (fn: string) => {
      state.rpcCalls.push(fn);
      return { data: state.missing, error: null };
    },
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
    if (prompt.includes("Compare this new shop photo")) {
      if (mode === "auto-camera" || mode === "auto-two-front") return metaResponse("not-json");
      if (mode === "improve-skip") return metaResponse(JSON.stringify({ action: "skip", pageId: null }));
      if (mode === "improve-replace") {
        const id = /id=([0-9a-f-]{36})/i.exec(prompt)?.[1] ?? null;
        return metaResponse(JSON.stringify({ action: "replace", pageId: id }));
      }
      return metaResponse(JSON.stringify({ action: "add", pageId: null }));
    }
    if (prompt.includes("Find every human face")) {
      if (mode === "blur") return metaResponse(JSON.stringify({ pages: indexes.map((index) => ({ index })) }));
      const faces = mode === "face" ? [[0.4, 0.4, 0.6, 0.6]] : [];
      return metaResponse(JSON.stringify({ pages: indexes.map((index) => ({ index, faces })) }));
    }
    if (mode === "rest") return new Response("rate limit", { status: 429 });
    if (mode === "named") {
      return metaResponse(
        JSON.stringify({
          pages: indexes.map((index) => ({
            index,
            kind_guess: "menu",
            is_menu: true,
            language: "th",
            section: "Skewers",
            items: [{ name: "หม่าล่า", price: "40", currency: "THB", note: "Mala beef" }],
            hours: { days: [{ d: "mon", open: "16:00", close: "23:00" }], raw: "Daily 16:00-23:00" },
          })),
          shop_language: "th",
          tagline_facts: ["Skewers"],
          shop_name: "Mala Mafia",
          colors: ["#E23D28", "#1C0E05"],
        }),
      );
    }
    if (mode === "rich") {
      return metaResponse(
        JSON.stringify({
          brand: {
            name: "Cafe Amazon",
            name_en: "drinks",
            tagline: "Coffee",
            phones: [],
            logo: { index: indexes[0] ?? 1, box: [0.1, 0.1, 0.4, 0.4] },
          },
          style: { primary: "#0B6B3A", secondary: "#F7F0E8", font: "rounded sans", vibe: "green cafe morning" },
          menu: [
            {
              category: "Coffee",
              items: [{ name: "Americano", name_en: "restaurant", price: "45", currency: "THB", photo: indexes[0] ?? 1 }],
            },
          ],
          deals: [{ title: "Weekday 10%", provider: "SCB", discount: "10%", conditions: "Weekdays" }],
          info: { hours_text: "Daily 7-19", address: "Soi 1", maps: null, language: "th" },
          photos: indexes.map((index) => ({ index, kind: "menu" })),
          hero: indexes[0] ?? 1,
          category: "drinks",
        }),
      );
    }
    if (mode === "auto-camera" || mode === "auto-two-front") {
      return metaResponse(
        JSON.stringify({
          menu: [
            {
              category: "Coffee",
              items: [{ name: "Americano", price: "45", currency: "THB", note: null }],
            },
          ],
          info: { hours: { days: [{ d: "mon", open: "08:00", close: "17:00" }], raw: "Mon 8-5" } },
          photos:
            mode === "auto-two-front"
              ? indexes.map((index) => ({ index, kind: "storefront" }))
              : indexes.map((index, position) => ({ index, kind: position === 0 ? "storefront" : "menu" })),
          hero: indexes[0] ?? 1,
        }),
      );
    }
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

let jpegStamp = 0;

async function jpegFile(name = "page.jpg"): Promise<File> {
  const stamp = ++jpegStamp;
  const buf = await sharp({
    create: {
      width: 40 + (stamp % 30),
      height: 24 + (stamp % 11),
      channels: 3,
      background: { r: (stamp * 47) % 256, g: (stamp * 91) % 256, b: (stamp * 13) % 256 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
  return new File([new Uint8Array(buf)], name, { type: "image/jpeg" });
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
    return prompt.startsWith("You are building a digital book");
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
    state.filters = [];
    state.rpcCalls = [];
    state.bookWrites = 0;
    state.ownerIds = [USER];
    state.demoAccount = false;
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

  it("rate limits book uploads on their own bucket and does not call Meta", async () => {
    for (let hit = 0; hit < BOOK_USER_LIMIT; hit += 1) {
      expect(await allowBook("203.0.113.8", USER)).toBe(true);
    }
    const response = await postPages();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(state.uploads).toHaveLength(0);
  });

  it("still accepts a book page when the snap bucket is full", async () => {
    for (let hit = 0; hit < SNAP_USER_LIMIT; hit += 1) {
      expect(await allowSnap("203.0.113.8", USER)).toBe(true);
    }
    const response = await postPages();
    expect(response.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalled();
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
    expect(sent.max_output_tokens).toBe(8000);
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

  async function postSession(
    items: { kind: "storefront" | "logo" | "menu" | "hours" | "extra" | "auto"; file?: File }[],
    shop = SHOP,
    bookMode?: string,
    fresh = false,
  ) {
    const form = new FormData();
    form.set("shop", shop);
    form.set("session", "1");
    if (bookMode) form.set("mode", bookMode);
    if (fresh) form.set("fresh", "1");
    for (const item of items) form.append(item.kind, item.file ?? (await jpegFile(item.kind + ".jpg")));
    return POST(
      new Request("http://localhost/api/book/pages", {
        method: "POST",
        body: form,
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
    );
  }

  it("stores a session logo as a logo page and a default theme when the logo read fails", async () => {
    const response = await postSession([{ kind: "logo" }, { kind: "menu" }, { kind: "hours" }]);
    expect(response.status).toBe(200);
    expect(state.pages.map((page) => page.kind)).toEqual(["logo", "menu", "hours"]);
    expect(state.book?.theme).toMatchObject({ mood: "bold", accent: "#FF7A35" });
  });

  it("a book upload with a shop id never calls the matcher or creates a shop", async () => {
    const response = await postSession([{ kind: "menu" }]);
    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(["shops", "id", SHOP]);
    expect(state.rpcCalls).toEqual(["book_missing"]);
    expect(state.rpcCalls.join(" ")).not.toContain("create_shop_from_snap");
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    );
    expect(source.includes("create_shop_from_snap")).toBe(false);
    expect(source.includes("buildMatcherPrompt")).toBe(false);
    expect(source.includes("/api/analyze")).toBe(false);
    for (const call of vi.mocked(fetch).mock.calls) {
      const sent = JSON.parse(String(call[1]?.body));
      const prompt = (sent.input[0].content as { type: string; text?: string }[]).find((part) => part.type === "input_text")
        ?.text ?? "";
      expect(prompt.includes("shop_id")).toBe(false);
      expect(prompt.includes("GPS fix")).toBe(false);
      expect(prompt.startsWith("You are building a digital book") || prompt.startsWith("Find every human face")).toBe(true);
    }
  });

  it("stores storefront, three menu photos, and hours as one book update", async () => {
    const response = await postSession([
      { kind: "storefront" },
      { kind: "menu" },
      { kind: "menu" },
      { kind: "menu" },
      { kind: "hours" },
    ]);
    expect(response.status).toBe(200);
    expect(state.bookWrites).toBe(1);
    expect(state.pages.map((page) => page.kind)).toEqual(["storefront", "menu", "menu", "menu", "hours"]);
    expect(state.pages.every((page) => page.shop_id === SHOP)).toBe(true);
    const reads = contentCalls(vi.mocked(fetch));
    expect(reads).toHaveLength(1);
    const sent = JSON.parse(String(reads[0]?.[1]?.body));
    expect(sent.input[0].content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(5);
  });

  it("skipping storefront and hours still saves the menu", async () => {
    const response = await postSession([{ kind: "menu" }, { kind: "menu" }, { kind: "menu" }]);
    expect(response.status).toBe(200);
    expect(state.bookWrites).toBe(1);
    expect(state.pages).toHaveLength(3);
    expect(state.pages.every((page) => page.kind === "menu")).toBe(true);
    expect(state.pages.some((page) => page.kind === "storefront" || page.kind === "hours")).toBe(false);
  });

  it("reads a seed batch over 8 images in one Muse call and still writes the book once", async () => {
    const items = Array.from({ length: 9 }, () => ({ kind: "menu" as const }));
    const response = await postSession(items);
    expect(response.status).toBe(200);
    expect(state.bookWrites).toBe(1);
    expect(state.pages).toHaveLength(9);
    const reads = contentCalls(vi.mocked(fetch));
    expect(reads).toHaveLength(1);
    const sizes = reads.map((call) => {
      const sent = JSON.parse(String(call[1]?.body));
      return sent.input[0].content.filter((part: { type: string }) => part.type === "input_image").length;
    });
    expect(sizes).toEqual([9]);
  });

  it("improve mode skips a duplicate, replaces a changed page, and adds a new one", async () => {
    const hoursId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const menuId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    state.pages = [
      { id: hoursId, kind: "hours", status: "live", extracted: { section: "old" }, shop_id: SHOP },
      { id: menuId, kind: "menu", status: "live", extracted: { section: "old" }, shop_id: SHOP },
    ];
    state.book = { status: "live", hours: {}, theme: {}, tagline: null, source_language: null, built_by_model: null };

    mode = "improve-skip";
    const skipped = await postSession([{ kind: "hours" }], SHOP, "improve");
    expect(skipped.status).toBe(200);
    const skippedBody = (await skipped.json()) as { summary?: string };
    expect(skippedBody.summary).toBe("1 skipped as duplicate");
    expect(state.pages.filter((page) => page.kind === "hours" && page.status === "live")).toHaveLength(1);
    expect(state.removed.length).toBeGreaterThan(0);

    mode = "improve-replace";
    const menuFile = await jpegFile("menu.jpg");
    const replaced = await postSession([{ kind: "menu", file: menuFile }], SHOP, "improve");
    expect(replaced.status).toBe(200);
    const replacedBody = (await replaced.json()) as { summary?: string };
    expect(replacedBody.summary).toContain("Updated 1 menu item");
    expect(state.pages.find((page) => page.id === menuId)?.status).toBe("removed");

    state.ownerIds = ["99999999-9999-4999-8999-999999999999"];
    mode = "improve-replace";
    const blocked = await postSession([{ kind: "menu", file: menuFile }], SHOP, "improve");
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toMatchObject({ summary: "1 skipped as duplicate" });
    expect(state.pages.filter((page) => page.kind === "menu" && page.status !== "removed")).toHaveLength(1);
    state.ownerIds = [USER];

    mode = "improve-add";
    const fresh = await sharp({
      create: { width: 40, height: 24, channels: 3, background: { r: 20, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const added = await postSession(
      [{ kind: "menu", file: new File([Uint8Array.from(fresh)], "new-menu.jpg", { type: "image/jpeg" }) }],
      SHOP,
      "improve",
    );
    expect(added.status).toBe(200);
    const addedBody = (await added.json()) as { summary?: string };
    expect(addedBody.summary).toContain("Added 1 menu item");
    expect(state.pages.filter((page) => page.kind === "menu" && page.status !== "removed").length).toBeGreaterThan(1);
  });

  it("saves one page when a batch repeats the same photo", async () => {
    const file = await jpegFile("dup.jpg");
    mode = "improve-add";
    const response = await postSession(
      [
        { kind: "menu", file },
        { kind: "menu", file },
      ],
      SHOP,
      "improve",
    );
    expect(response.status).toBe(200);
    expect(state.pages.filter((page) => page.status !== "removed")).toHaveLength(1);
    expect(await response.json()).toMatchObject({ summary: "Added 1 menu item, 1 skipped as duplicate" });
  });

  it("saves one page when the first batch repeats the same photo", async () => {
    const file = await jpegFile("seed-dup.jpg");
    const response = await postSession([
      { kind: "menu", file },
      { kind: "menu", file },
    ]);
    expect(response.status).toBe(200);
    expect(state.pages.filter((page) => page.status !== "removed")).toHaveLength(1);
    const reads = contentCalls(vi.mocked(fetch));
    expect(reads).toHaveLength(1);
    const sent = JSON.parse(String(reads[0]?.[1]?.body));
    expect(sent.input[0].content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(1);
  });

  it("a judge and a normal user add a page instead of replacing one they do not own", async () => {
    const pageId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const liveBook = { status: "live", hours: {}, theme: {}, tagline: null, source_language: null, built_by_model: null };
    state.shop = { id: SHOP, category: "street_food", slug: "mala-mafia", is_demo: true };
    state.demoAccount = true;
    state.ownerIds = ["99999999-9999-4999-8999-999999999999"];
    state.pages = [{ id: pageId, kind: "storefront", status: "live", extracted: { section: "old" }, shop_id: SHOP }];
    state.book = liveBook;
    mode = "improve-replace";
    const judge = await postSession([{ kind: "storefront" }], SHOP, "improve");
    expect(judge.status).toBe(200);
    expect(state.pages.find((page) => page.id === pageId)?.status).toBe("live");
    expect(state.pages.filter((page) => page.kind === "storefront" && page.status === "live")).toHaveLength(1);

    state.pages = [{ id: pageId, kind: "storefront", status: "live", extracted: { section: "old" }, shop_id: SHOP }];
    state.book = liveBook;
    state.shop = { id: SHOP, category: "street_food", is_demo: false };
    state.demoAccount = false;
    state.ownerIds = [];
    state.uploads = [];
    const joined = await postSession([{ kind: "storefront" }], SHOP, "improve");
    expect(joined.status).toBe(200);
    expect(state.pages.find((page) => page.id === pageId)?.status).toBe("live");

    state.pages = [
      { id: pageId, kind: "storefront", status: "live", extracted: { section: "old" }, shop_id: SHOP },
      ...Array.from({ length: 11 }, (_, index) => ({
        id: "eeeeeeee-eeee-4eee-8eee-" + String(index + 1).padStart(12, "0"),
        kind: "menu",
        status: "live",
        extracted: { section: "old" },
        shop_id: SHOP,
      })),
    ];
    state.book = liveBook;
    const full = await postSession([{ kind: "storefront" }], SHOP, "improve");
    expect(full.status).toBe(200);
    expect(state.pages.find((page) => page.id === pageId)?.status).toBe("live");
    expect(state.pages.filter((page) => page.status !== "removed")).toHaveLength(12);
  });

  it("a repeat judge upload keeps the storefront and saves the menu photos", async () => {
    const pageId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    state.shop = { id: SHOP, category: "street_food", slug: "mala-mafia", is_demo: true };
    state.demoAccount = true;
    state.ownerIds = ["99999999-9999-4999-8999-999999999999"];
    state.pages = [{ id: pageId, kind: "storefront", status: "live", extracted: {}, shop_id: SHOP }];
    state.book = { status: "live", hours: {}, theme: {}, tagline: null, source_language: null, built_by_model: null };
    mode = "improve-replace";
    const response = await postSession(
      [{ kind: "storefront" }, { kind: "menu" }, { kind: "menu" }],
      SHOP,
      "improve",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).not.toMatchObject({ error: "already_there" });
    expect(state.pages.find((page) => page.id === pageId)?.status).toBe("live");
    expect(state.pages.filter((page) => page.kind === "storefront" && page.status === "live")).toHaveLength(1);
    expect(state.pages.filter((page) => page.kind === "menu" && page.status === "live")).toHaveLength(2);
  });

  const coffeeFacts = {
    section: "Coffee",
    items: [{ name: "Americano", price: "45", currency: "THB", note: null, category: "Coffee" }],
    hours: null,
  };
  const blankFacts = { section: null, items: [] as unknown[], hours: null };
  const liveBook = { status: "live", hours: {}, theme: {}, tagline: null, source_language: null, built_by_model: null };

  function stockedDemo(owner: boolean) {
    const frontId = "12121212-1212-4121-8121-121212121212";
    const menuA = "13131313-1313-4131-8131-131313131313";
    const menuB = "14141414-1414-4141-8141-141414141414";
    state.shop = { id: SHOP, category: "drinks", slug: "mala-mafia", is_demo: true };
    state.demoAccount = !owner;
    state.ownerIds = owner ? [USER] : ["99999999-9999-4999-8999-999999999999"];
    state.book = liveBook;
    state.pages = [
      { id: frontId, kind: "storefront", status: "live", extracted: { section: "door" }, shop_id: SHOP },
      { id: menuA, kind: "menu", status: "live", extracted: coffeeFacts, shop_id: SHOP },
      { id: menuB, kind: "menu", status: "live", extracted: blankFacts, shop_id: SHOP },
    ];
    mode = "auto-camera";
    return frontId;
  }

  it("a demo explorer re-uploads auto photos without a second storefront or duplicate menus", async () => {
    const frontId = stockedDemo(false);
    const response = await postSession(
      [{ kind: "auto" }, { kind: "auto" }, { kind: "auto" }],
      SHOP,
      "improve",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).not.toMatchObject({ error: "already_there" });
    expect(state.pages).toEqual([
      { id: frontId, kind: "storefront", status: "live", extracted: { section: "door" }, shop_id: SHOP },
      { id: "13131313-1313-4131-8131-131313131313", kind: "menu", status: "live", extracted: coffeeFacts, shop_id: SHOP },
      { id: "14141414-1414-4141-8141-141414141414", kind: "menu", status: "live", extracted: blankFacts, shop_id: SHOP },
    ]);
  });

  it("a verified owner re-uploads auto photos by replacing the storefront and keeping the menus", async () => {
    const frontId = stockedDemo(true);
    const response = await postSession(
      [{ kind: "auto" }, { kind: "auto" }, { kind: "auto" }],
      SHOP,
      "improve",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).not.toMatchObject({ error: "already_there" });
    expect(state.pages.find((page) => page.id === frontId)?.status).toBe("removed");
    expect(state.pages.filter((page) => page.kind === "storefront" && page.status === "live")).toHaveLength(1);
    expect(
      state.pages.filter((page) => page.kind === "menu" && page.status === "live").map((page) => page.id),
    ).toEqual(["13131313-1313-4131-8131-131313131313", "14141414-1414-4141-8141-141414141414"]);
  });

  it("two auto photos that both read as storefront keep one live page", async () => {
    state.book = liveBook;
    mode = "auto-two-front";
    const response = await postSession([{ kind: "auto" }, { kind: "auto" }], SHOP, "improve");
    expect(response.status).toBe(200);
    expect(await response.json()).not.toMatchObject({ error: "already_there" });
    expect(state.pages.filter((page) => page.status !== "removed")).toHaveLength(1);
    expect(state.pages[0]?.kind).toBe("storefront");
  });

  it("joining an existing shop with a live page succeeds", async () => {
    const pageId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    state.pages = [{ id: pageId, kind: "storefront", status: "live", extracted: { section: "old" }, shop_id: SHOP }];
    state.book = { status: "live", hours: {}, theme: {}, tagline: null, source_language: null, built_by_model: null };
    const refused = await postSession([{ kind: "storefront" }]);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "already_there" });
    mode = "improve-replace";
    const joined = await postSession([{ kind: "storefront" }], SHOP, "improve");
    expect(joined.status).toBe(200);
    expect(state.pages.filter((page) => page.kind === "storefront" && page.status === "live")).toHaveLength(1);
  });

  it("stores an extra page as the extra kind", async () => {
    const response = await postSession([{ kind: "extra" }]);
    expect(response.status).toBe(200);
    expect(state.pages.map((page) => page.kind)).toEqual(["extra"]);
  });

  it("keeps a non-menu image in a menu session instead of 409", async () => {
    mode = "notmenu";
    const response = await postSession([{ kind: "menu" }]);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.status).not.toBe(409);
    expect(state.removed).toHaveLength(0);
    expect(state.uploads).toHaveLength(1);
    expect(state.pages.map((page) => page.kind)).toEqual(["extra"]);
  });

  it("a seed save calls the AI once and stores extracted items", async () => {
    const response = await postSession([{ kind: "logo" }, { kind: "menu" }, { kind: "menu" }]);
    expect(response.status).toBe(200);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const reads = contentCalls(fetchMock);
    expect(reads).toHaveLength(1);
    const menu = state.pages.filter((page) => page.kind === "menu");
    expect(menu).toHaveLength(2);
    expect(menu[0]?.extracted).toEqual({
      section: "Noodles",
      items: [{ name: "Pad Thai", price: "50", currency: "THB", note: null }],
    });
    expect(menu[0]?.ai_meta).toMatchObject({ model: "muse-spark-1.3-live", images_in_call: 3 });
  });

  it("keeps seed photos and sets ai_meta.error when the AI call fails", async () => {
    mode = "rest";
    const response = await postSession([{ kind: "menu" }, { kind: "menu" }]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reading).toBe(true);
    expect(body.ai.error).toBe("busy");
    expect(state.pages).toHaveLength(2);
    expect(state.removed).toHaveLength(0);
    expect(state.pages[0]?.extracted).toEqual({});
    expect(state.pages[0]?.ai_meta).toMatchObject({ model: null, images_in_call: 0, error: "busy" });
  });

  it("names a fresh New shop from the reader and does not rename a real name", async () => {
    state.shop = { id: SHOP, category: "other", name: "New shop", slug: "new-shop-abc" };
    state.pages = [];
    state.book = null;
    mode = "named";
    const response = await postSession([{ kind: "menu" }], SHOP, undefined, true);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.slug).toBe("mala-mafia-111111");
    expect(state.shop?.name).toBe("Mala Mafia");
    expect(state.shop?.slug).toBe("mala-mafia-111111");

    state.shop = { id: SHOP, category: "street_food", name: "Blended fruit juice menu", slug: "juice-menu" };
    state.pages = [];
    state.book = null;
    const kept = await postSession([{ kind: "menu" }], SHOP, undefined, true);
    expect(kept.status).toBe(200);
    expect(state.shop?.name).toBe("Blended fruit juice menu");
    expect(state.shop?.slug).toBe("juice-menu");
  });

  it("names a New shop on a retry that is not fresh", async () => {
    state.shop = { id: SHOP, category: "other", name: "New shop", slug: "new-shop-abc" };
    state.pages = [];
    state.book = null;
    mode = "named";
    const response = await postSession([{ kind: "menu" }], SHOP, undefined, false);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.slug).toBe("mala-mafia-111111");
    expect(state.shop?.name).toBe("Mala Mafia");
  });

  it("never renames a shop and sets category only from other", async () => {
    state.shop = { id: SHOP, category: "street_food", name: "Blended fruit juice menu" };
    mode = "named";
    const renamed = await postSession([{ kind: "logo" }, { kind: "menu" }], SHOP, undefined, true);
    expect(renamed.status).toBe(200);
    expect(state.shop?.name).toBe("Blended fruit juice menu");
    expect(state.shop?.category).toBe("street_food");
    const menu = state.pages.find((page) => page.kind === "menu");
    expect(menu?.extracted).toMatchObject({
      items: [{ name: "หม่าล่า", price: "40", currency: "THB", note: "Mala beef" }],
    });

    state.shop = { id: SHOP, category: "other", name: "Mala Mafia" };
    state.pages = [];
    state.book = null;
    mode = "rich";
    const categorized = await postSession([{ kind: "extra" }], SHOP, undefined, true);
    expect(categorized.status).toBe(200);
    expect(state.shop?.name).toBe("Mala Mafia");
    expect(state.shop?.category).toBe("drinks");
    expect(state.pages.map((page) => page.kind)).toEqual(["menu"]);
    const item = (state.pages[0]?.extracted as { items?: { nameEn?: string }[] } | undefined)?.items?.[0];
    expect(item?.nameEn).toBeUndefined();
  });
});
