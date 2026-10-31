import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSignedUrlCache, SIGNED_URL_TTL_SECONDS } from "../../../../../lib/photos/sign";
import { GET } from "./route";

const getUser = vi.hoisted(() => vi.fn());
const createSignedUrl = vi.hoisted(() => vi.fn());
const tables = vi.hoisted(() => ({
  posts: [] as Record<string, unknown>[],
  shop_book_pages: [] as Record<string, unknown>[],
  shop_books: [] as Record<string, unknown>[],
  shop_owners: [] as Record<string, unknown>[],
}));
const buckets = vi.hoisted(() => [] as string[]);

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => undefined };
});

vi.mock("../../../../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("../../../../../lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from(table: keyof typeof tables) {
      const rows = tables[table] ?? [];
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle: async () => {
          const found = rows.filter((row) => filters.every((fn) => fn(row)));
          return { data: found[0] ?? null, error: null };
        },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => void) {
          resolve({ data: rows.filter((row) => filters.every((fn) => fn(row))), error: null });
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return { createSignedUrl };
      },
    },
  }),
}));

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();

function call(bucket: string, parts: string[]) {
  return GET(new Request("http://localhost/api/media/" + bucket + "/" + parts.join("/")), {
    params: Promise.resolve({ bucket, path: parts }),
  });
}

describe("media signing", () => {
  beforeEach(() => {
    clearSignedUrlCache();
    getUser.mockReset();
    createSignedUrl.mockReset();
    buckets.length = 0;
    tables.posts = [];
    tables.shop_book_pages = [];
    tables.shop_books = [];
    tables.shop_owners = [];
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/storage/v1/object/sign/photo.jpg?token=abc" },
    });
  });

  it("does not sign a post photo nobody can see", async () => {
    tables.posts = [{ photo_path: "user/a.jpg", author_id: "author-1", shop_id: "shop-1", status: "live", expires_at: past }];
    const response = await call("post-photos", ["user", "a.jpg"]);
    expect(response.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a live post for anyone and caches the redirect for one minute", async () => {
    tables.posts = [{ photo_path: "user/a.jpg", author_id: "author-1", shop_id: "shop-1", status: "live", expires_at: future }];
    const response = await call("post-photos", ["user", "a.jpg"]);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("token=abc");
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(response.headers.get("cache-control")).not.toContain("480");
    expect(buckets).toEqual(["post-photos"]);
    expect(createSignedUrl).toHaveBeenCalledWith("user/a.jpg", SIGNED_URL_TTL_SECONDS);
  });

  it("signs an ended post for its author and for the verified owner", async () => {
    tables.posts = [{ photo_path: "user/a.jpg", author_id: "author-1", shop_id: "shop-1", status: "kept", expires_at: past }];
    getUser.mockResolvedValue({ data: { user: { id: "author-1" } }, error: null });
    const author = await call("post-photos", ["user", "a.jpg"]);
    expect(author.status).toBe(307);

    clearSignedUrlCache();
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    tables.shop_owners = [{ user_id: "owner-1", shop_id: "shop-1", status: "verified" }];
    const owner = await call("post-photos", ["user", "a.jpg"]);
    expect(owner.status).toBe(307);
  });

  it("signs a live book page for any shop and hides a hidden book", async () => {
    tables.shop_book_pages = [{ shop_id: "shop-1", status: "live", image_path: "shop-1/menu.jpg" }];
    tables.shop_books = [{ shop_id: "shop-1", status: "hidden" }];
    const hidden = await call("shop-book", ["shop-1", "menu.jpg"]);
    expect(hidden.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();

    tables.shop_books = [{ shop_id: "shop-1", status: "live" }];
    const live = await call("shop-book", ["shop-1", "menu.jpg"]);
    expect(live.status).toBe(307);
    expect(buckets).toEqual(["shop-book"]);
  });

  it("signs a kept post for anyone and keeps the public cache", async () => {
    tables.posts = [{ photo_path: "user/a.jpg", author_id: "author-1", shop_id: "shop-1", status: "kept", expires_at: past }];
    const response = await call("post-photos", ["user", "a.jpg"]);
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
  });

  it("keeps an author-only or owner-only photo out of the shared cache", async () => {
    tables.posts = [{ photo_path: "user/a.jpg", author_id: "author-1", shop_id: "shop-1", status: "live", expires_at: past }];
    getUser.mockResolvedValue({ data: { user: { id: "author-1" } }, error: null });
    const author = await call("post-photos", ["user", "a.jpg"]);
    expect(author.status).toBe(307);
    expect(author.headers.get("cache-control")).toBe("private, no-store");

    clearSignedUrlCache();
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    tables.shop_owners = [{ user_id: "owner-1", shop_id: "shop-1", status: "verified" }];
    const owner = await call("post-photos", ["user", "a.jpg"]);
    expect(owner.status).toBe(307);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
  });

  it("signs a hero cutout when the live book theme names it", async () => {
    tables.shop_books = [{ shop_id: "shop-1", status: "live", theme: { heroPath: "book-cutouts/shop-1/hero.webp" } }];
    const live = await call("shop-book", ["book-cutouts", "shop-1", "hero.webp"]);
    expect(live.status).toBe(307);

    clearSignedUrlCache();
    createSignedUrl.mockClear();
    tables.shop_books = [{ shop_id: "shop-1", status: "hidden", theme: { heroPath: "book-cutouts/shop-1/hero.webp" } }];
    const hidden = await call("shop-book", ["book-cutouts", "shop-1", "hero.webp"]);
    expect(hidden.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a cutout only when a live page names it", async () => {
    tables.shop_book_pages = [{ shop_id: "shop-1", status: "live", image_path: "shop-1/menu.jpg", extracted: { logo_url: "book-cutouts/shop-1/logo.webp" } }];
    tables.shop_books = [{ shop_id: "shop-1", status: "live" }];
    const named = await call("shop-book", ["book-cutouts", "shop-1", "logo.webp"]);
    expect(named.status).toBe(307);

    clearSignedUrlCache();
    createSignedUrl.mockClear();
    const missing = await call("shop-book", ["book-cutouts", "shop-1", "other.webp"]);
    expect(missing.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
