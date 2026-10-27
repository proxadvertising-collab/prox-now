import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = resolve(root, "supabase/migrations/0001_core_schema.sql");
const seedRel = "supabase/seeds/soi102_shops.sql";
const seedPath = resolve(root, seedRel);

function tableBody(sql: string, table: string): string {
  const marker = "create table if not exists public." + table + " (";
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error("missing table " + table);
  const from = start + marker.length;
  const end = sql.indexOf("\n);", from);
  if (end < 0) throw new Error("missing end of table " + table);
  return sql.slice(from, end);
}

describe("core schema files", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const seed = readFileSync(seedPath, "utf8");

  it("enables row level security for every new table", () => {
    const tables = [...migration.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(migration).toContain("alter table public." + table + " enable row level security;");
    }
  });

  it("keeps one coupon per person, shop, and day, and expires posts after two hours", () => {
    expect(migration).toContain("unique (holder_id, shop_id, day)");
    expect(migration).toContain("interval '2 hours'");
    expect(/generated\s+always/i.test(migration)).toBe(false);
    const dayLine = tableBody(migration, "coupons")
      .split(/\r?\n/)
      .find((line) => /^\s*day\s+date\b/i.test(line));
    expect(dayLine).toBeTruthy();
    expect(dayLine!.toLowerCase().includes("default")).toBe(false);
  });

  it("defines the helper functions and the launch-market shop columns", () => {
    for (const name of ["nearby_shops", "keep_post", "pass_post", "is_verified_owner"]) {
      expect(migration).toContain("function public." + name);
    }
    const shops = tableBody(migration, "shops");
    expect(shops).toContain("country_code");
    expect(shops).toContain("timezone");
    expect(shops).toContain("currency");
  });

  it("seeds the launch-market demo shops and nothing sensitive", () => {
    expect(seedRel).not.toBe("supabase/seed.sql");
    expect(existsSync(resolve(root, "supabase/seed.sql"))).toBe(false);
    for (const slug of [
      "mala-mafia",
      "coconut-shake-stand",
      "krua-mae-yen",
      "pak-kapi",
      "thuk-jai-chieo",
      "clean-together",
      "baan-air",
      "beegee-barber",
      "mexican-friend-tbd",
    ]) {
      expect(seed).toContain(slug);
    }
    expect(seed.match(/TODO_REAL_COORDS/g)?.length).toBeGreaterThanOrEqual(9);
    for (const file of [migration, seed]) {
      expect(file).not.toContain("service_role");
      expect(file).not.toContain("eyJ");
      expect(file.toLowerCase()).not.toContain("password");
    }
  });

  it("never lets a client choose posts.created_at", () => {
    expect(migration).not.toContain("coalesce(new.created_at");
    expect(migration).toContain("new.created_at := now()");
  });
});

describe("user shop migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0002_user_shops.sql"), "utf8");

  it("defines a definer function with a rate limit and a nearby-name dedupe", () => {
    expect(sql.toLowerCase()).toContain("security definer");
    expect(sql).toContain(
      "revoke all on function public.create_shop_from_snap(text, text, text, double precision, double precision, text) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.create_shop_from_snap(text, text, text, double precision, double precision, text) to authenticated;",
    );
    expect(sql).not.toMatch(/grant execute on function public\.create_shop_from_snap[\s\S]*\bto anon\b/);
    expect(sql).toContain("rate_limited");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("<= 40");
    expect(sql).toContain("lower(shops.name)");
    expect(sql).toContain("lower(shops.name_local)");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});
