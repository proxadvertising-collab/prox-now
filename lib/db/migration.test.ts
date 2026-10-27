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

describe("post photos migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0003_post_photos.sql"), "utf8");

  it("defines the bucket, own-folder insert, and create_post grants", () => {
    expect(sql).toContain("post-photos");
    expect(sql).toContain("on conflict (id) do nothing");
    expect(sql).toContain("614400");
    expect(sql).toContain("image/jpeg");
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(sql.toLowerCase()).not.toContain("for update");
    expect(sql.toLowerCase()).not.toContain("for delete");
    expect(sql).toContain("posts_shop_status_expires_idx");
    expect(sql).toContain("posts_author_created_at_idx");
    expect(sql.toLowerCase()).toContain("security definer");
    expect(sql).toContain("rate_limited");
    expect(sql).toContain("already_live");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain(
      "revoke all on function public.create_post(uuid, text, text, jsonb) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.create_post(uuid, text, text, jsonb) to authenticated;",
    );
    expect(sql).not.toMatch(/grant execute on function public\.create_post[\s\S]*\bto anon\b/);
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("worldwide shop fields migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0004_shop_worldwide_fields.sql"), "utf8");

  it("drops Thailand defaults and passes country, timezone, and currency through", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("alter column country_code drop default");
    expect(sql).toContain("alter column country_code drop not null");
    expect(sql).toContain("alter column timezone drop default");
    expect(sql).toContain("alter column currency drop default");
    expect(sql).toContain("p_country_code");
    expect(sql).toContain("p_timezone");
    expect(sql).toContain("p_currency");
    expect(sql).toContain(
      "drop function if exists public.create_shop_from_snap(text, text, text, double precision, double precision, text);",
    );
    expect(sql).toContain(
      "revoke all on function public.create_shop_from_snap(text, text, text, double precision, double precision, text, text, text, text) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.create_shop_from_snap(text, text, text, double precision, double precision, text, text, text, text) to authenticated;",
    );
    const shopGrant = sql
      .split("\n")
      .find((line) => line.startsWith("grant execute on function public.create_shop_from_snap"));
    expect(shopGrant).toBeTruthy();
    expect(shopGrant).not.toContain("anon");
    expect(sql).toContain("place_seed_stats");
    expect(sql).toContain("grant execute on function public.place_seed_stats() to anon, authenticated;");
    expect(sql).not.toContain("Asia/Bangkok");
    expect(sql).not.toContain("'TH'");
    expect(sql).not.toContain("'THB'");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("post facts migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0005_post_facts.sql"), "utf8");

  it("adds optional facts and an author-only delete", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("add column if not exists facts jsonb");
    expect(sql).toContain("jsonb_typeof(facts) = 'object'");
    expect(sql).toContain("pg_column_size(facts) <= 4096");
    expect(sql).toContain("p_facts jsonb default null");
    expect(sql).toContain("drop function if exists public.create_post(uuid, text, text, jsonb);");
    expect(sql).toContain(
      "revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;",
    );
    expect(sql).toContain("not_author");
    expect(sql).toContain("delete_own_post");
    expect(sql).toContain(
      "revoke all on function public.delete_own_post(uuid) from public, anon;",
    );
    expect(sql).toContain("grant execute on function public.delete_own_post(uuid) to authenticated;");
    expect(sql).toContain("post_photos_delete_own");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("loop migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0006_loop.sql"), "utf8");

  it("fixes keep, deletes on pass, and keeps anonymous place facts", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("coalesce(nullif(btrim(shops.timezone), ''), 'UTC')");
    expect(sql).toContain("when others then");
    expect(sql).toContain("v_tz := 'UTC'");
    expect(sql).toContain("pass_post_begin");
    expect(sql).toContain("pass_post_finish");
    expect(sql).toContain("photo_still_stored");
    expect(sql).toContain("revoke all on function public.pass_post(uuid) from public, anon, authenticated");
    expect(sql).not.toContain("grant execute on function public.pass_post(uuid) to authenticated");
    expect(sql).toContain("post_photos_delete_owner");
    expect(sql).toContain("redeem_coupon");
    expect(sql).toContain("not_found");
    expect(sql).toContain("not_owner");
    expect(sql).toContain("already_used");
    expect(sql).toContain("expired");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("v_recent >= 60");
    expect(sql).toContain("claim_shop");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("create table if not exists public.place_facts");
    expect(sql).toContain("place_facts_select_public");
    expect(sql).toContain("grant select on table public.place_facts to anon, authenticated");
    expect(sql).not.toContain("grant insert on table public.place_facts");
    expect(sql).toContain("place_facts_shop_observed_idx");
    expect(sql).toContain("anonymous_place_facts");
    expect(sql).toContain("- 'caption' - 'captions'");
    expect(sql).toContain("insert into public.place_facts");
    expect(sql).toContain("delete from public.place_facts where post_id = p_id");
    expect(sql).toContain("expired_undecided");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("text_original = null");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("demo zone migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0007_demo_zone.sql"), "utf8");

  it("falls back to the Soi 102 point when no shop is marked demo", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("function public.demo_zone()");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("grant execute on function public.demo_zone() to public, anon, authenticated");
    expect(sql).toContain("coalesce(avg(shops.lat), 12.5684)");
    expect(sql).toContain("coalesce(avg(shops.lng), 99.9577)");
    expect(sql).toContain("16.5::double precision as zoom");
    expect(sql).toContain("where shops.is_demo");
    expect(sql).toContain("is_seed boolean not null default false");
    expect(sql).toContain("timestamptz '2026-11-12 00:00+00'");
    expect(sql.split("p.is_seed = false").length - 1).toBe(4);
    expect(sql).toContain("function public.expired_undecided()");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
    expect(sql).not.toContain("demo_reset");
  });
});
