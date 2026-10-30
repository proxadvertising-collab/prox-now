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
    ]) {
      expect(seed).toContain(slug);
    }
    expect(seed).not.toContain("mexican-friend-tbd");
    expect(seed).not.toContain("TODO Mexican");
    expect(seed).toMatch(/'beegee-barber'[^)]*true\) -- TODO_REAL_COORDS/);
    expect(seed).not.toMatch(/'beegee-barber'[^)]*true\),/);
    expect(seed.match(/TODO_REAL_COORDS/g)?.length).toBe(8);
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

  it("lets a non-seed post end early and rejects one that lasts past two hours", () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const created = Date.parse("2026-10-27T12:00:00.000Z");
    const branch = sql.slice(sql.indexOf("check ("), sql.indexOf(");", sql.indexOf("check (")));
    expect(branch).toContain("(is_seed and expires_at = timestamptz '2026-11-12 00:00+00')");
    expect(branch).toContain("(not is_seed and expires_at <= created_at + interval '2 hours')");
    expect(branch).not.toContain("not is_seed and expires_at = created_at + interval '2 hours'");
    const earlyAllowed = created + twoHours - 60_000 <= created + twoHours;
    const exactAllowed = created + twoHours <= created + twoHours;
    const lateRejected = created + twoHours + 1_000 <= created + twoHours;
    expect(earlyAllowed).toBe(true);
    expect(exactAllowed).toBe(true);
    expect(lateRejected).toBe(false);
    expect(sql).toContain("elsif tg_op = 'INSERT' then");
    expect(sql).toContain("new.expires_at := new.created_at + interval '2 hours'");
  });
});

describe("demo accounts migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0008_demo_accounts.sql"), "utf8");

  it("lets a person read only their own demo row", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("create table if not exists public.demo_accounts");
    expect(sql).toContain("user_id uuid primary key references auth.users (id) on delete cascade");
    expect(sql).toContain("check (role in ('explorer', 'owner'))");
    expect(sql).toContain("alter table public.demo_accounts enable row level security");
    expect(sql).toContain("demo_accounts_select_own");
    expect(sql).toContain("user_id = (select auth.uid())");
    expect(sql).toContain("grant select on table public.demo_accounts to authenticated");
    expect(sql).not.toContain("grant insert");
    expect(sql).not.toContain("grant update");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("demo window migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0009_demo_window.sql"), "utf8");

  it("rejects a non-owner, a real shop, and a seed post, and repeats only the explorer coupon", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("function public.demo_end_window(p_post_id uuid)");
    expect(sql).toContain("raise exception 'not_owner'");
    expect(sql).toContain("raise exception 'not_demo_shop'");
    expect(sql).toContain("raise exception 'seed_post'");
    expect(sql).toContain("set expires_at = now()");
    expect(sql).toContain("grant execute on function public.demo_end_window(uuid) to authenticated");
    expect(sql).toContain("where demo_repeat = false");
    expect(sql).toContain("demo_accounts.role = 'explorer'");
    expect(sql).toContain("and shops.is_demo");
    expect(sql).toContain("'liveNow'");
    expect(sql).toContain("and s.is_demo");
    expect(sql).toContain("and p.is_seed = false");
    expect(sql).toContain("and p.expires_at > now()");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("rate limit migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0010_rate_limits.sql"), "utf8");

  it("counts snap and judge hits in a locked hour window the client cannot write", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("create table if not exists public.rate_counters");
    expect(sql).toContain("primary key (bucket, subject, window_start)");
    expect(sql).toContain("check (bucket in ('snap', 'judge'))");
    expect(sql).toContain("alter table public.rate_counters enable row level security");
    expect(sql).toContain("using (false)");
    expect(sql).toContain("revoke all on table public.rate_counters from public, anon, authenticated");
    expect(sql).not.toContain("grant select on table public.rate_counters");
    expect(sql).not.toContain("grant insert on table public.rate_counters");
    expect(sql).toContain("function public.take_rate_limit(p_bucket text, p_subjects text[])");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("v_limit := 20");
    expect(sql).toContain("v_limit := 60");
    expect(sql).toContain("v_subject <> 'user:' || auth.uid()::text");
    expect(sql).toContain("date_trunc('hour', pg_catalog.now())");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    const denyAt = sql.indexOf("if coalesce(v_hits, 0) >= v_limit then");
    const insertAt = sql.indexOf("insert into public.rate_counters");
    expect(denyAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(denyAt);
    expect(sql).toContain("return false;");
    expect(sql).toContain("grant execute on function public.take_rate_limit(text, text[]) to anon, authenticated");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("shop book migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0011_shop_book.sql"), "utf8");

  it("turns on row level security and does not let clients write the book", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql.match(/enable row level security/g)?.length).toBe(3);
    expect(sql).toContain("alter table public.shop_books enable row level security");
    expect(sql).toContain("alter table public.shop_book_pages enable row level security");
    expect(sql).toContain("alter table public.shop_book_translations enable row level security");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("for insert");
    expect(sql).not.toContain("for delete");
    expect(sql).not.toMatch(/create policy [^;]*for update/i);
    expect(sql).toContain("revoke all on function public.book_remove_page(uuid) from public, anon");
    expect(sql).toContain("revoke all on function public.book_owner_update(uuid, jsonb, text) from public, anon");
    expect(sql).not.toContain("grant execute on function public.book_remove_page(uuid) to anon");
    expect(sql).not.toContain("grant execute on function public.book_owner_update(uuid, jsonb, text) to anon");
    expect(sql).toContain("values ('shop-book', 'shop-book', true, 1048576");
    expect(sql).not.toMatch(/create policy shop_book_\w*[\s\S]{0,80}for insert/);
    expect(sql).toContain("No insert, update or delete policy");
    expect(sql).toContain("function public.book_missing");
    expect(sql).toContain("function public.book_public");
    expect(sql).toContain("is_verified_owner");
    expect(sql).toContain("display_name");
    expect(sql).not.toContain("eyJ");
  });
});

describe("stack posts migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0012_stack_posts.sql"), "utf8");

  it("allows ten live photos, a 40-post day, and a separate book bucket", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("create or replace function public.create_post(");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("coalesce(is_seed, false) = false");
    expect(sql).toContain(">= 40");
    expect(sql).toContain(">= 10");
    expect(sql).toContain("raise exception 'shop_full'");
    expect(sql).toContain("raise exception 'rate_limited'");
    expect(sql).not.toMatch(/raise exception 'already_live'/);
    expect(sql).toContain(
      "revoke all on function public.create_post(uuid, text, text, jsonb, jsonb) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.create_post(uuid, text, text, jsonb, jsonb) to authenticated;",
    );
    const postGrant = sql
      .split("\n")
      .find((line) => line.startsWith("grant execute on function public.create_post"));
    expect(postGrant).toBeTruthy();
    expect(postGrant).not.toContain("anon");
    expect(sql).toContain("check (bucket in ('snap', 'judge', 'book'))");
    expect(sql).toContain("p_bucket not in ('snap', 'judge', 'book')");
    expect(sql).toContain("raise exception 'bad_bucket'");
    expect(sql).toContain("v_limit := 20");
    expect(sql).toContain("v_limit := 60");
    expect(sql).toContain("v_limit := 120");
    expect(sql).toContain("grant execute on function public.take_rate_limit(text, text[]) to anon, authenticated");
    expect(sql.toLowerCase()).not.toContain("service_role");
    expect(sql).not.toContain("eyJ");
  });
});

describe("verify claim migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0015_verify_claim.sql"), "utf8");

  it("verifies the caller only and leaves a taken shop alone", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("create or replace function public.verify_claim(p_shop_id uuid)");
    expect(sql).toContain("create or replace function public.claim_state(p_shop_id uuid)");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("status = 'verified'");
    expect(sql).toContain("raise exception 'already_owned'");
    expect(sql).toContain("on conflict (shop_id, user_id)");
    expect(sql).toContain("revoke all on function public.verify_claim(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.verify_claim(uuid) to authenticated");
    expect(sql).not.toContain("grant execute on function public.verify_claim(uuid) to anon");
    expect(sql).not.toContain("eyJ");
    expect(sql.toLowerCase()).not.toContain("service_role");
  });
});

describe("reset demo migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0016_reset_demo.sql"), "utf8");

  it("clears only demo accounts at demo shops and lets the creator rename", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("create or replace function public.reset_demo()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("raise exception 'not_demo'");
    expect(sql).toContain("from public.demo_accounts");
    expect(sql).toContain("shops.is_demo = true");
    expect(sql).toContain("delete from storage.objects");
    expect(sql).toContain("bucket_id = 'post-photos'");
    expect(sql).toContain("delete from public.coupons");
    expect(sql).toContain("delete from public.posts");
    expect(sql).toContain("text_translated");
    expect(sql).toContain("select shops.id, v_owner, 'verified'");
    expect(sql).not.toContain("delete from public.shops");
    expect(sql).not.toContain("delete from public.profiles");
    expect(sql).not.toContain("delete from auth.users");
    expect(sql).toContain("revoke all on function public.reset_demo() from public, anon");
    expect(sql).toContain("grant execute on function public.reset_demo() to authenticated");
    expect(sql).not.toContain("grant execute on function public.reset_demo() to anon");
    expect(sql).toContain("create or replace function public.set_shop_name(p_shop_id uuid, p_name text)");
    expect(sql).toContain("v_creator is distinct from auth.uid()");
    expect(sql).toContain("status = 'verified'");
    expect(sql).toContain("raise exception 'not_allowed'");
    expect(sql).toContain("set name = v_name");
    expect(sql).not.toContain("set slug");
    expect(sql).not.toContain("eyJ");
    expect(sql.toLowerCase()).not.toContain("service_role");
  });
});

describe("desktop loop migration", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/0017_desktop_loop.sql"), "utf8");

  it("marks pin and demo fixes and cancels only a pending claim", () => {
    expect(sql).toContain("Apply it only after the captain writes apply");
    expect(sql).toContain("location_source text not null default 'gps'");
    expect(sql).toContain("check (location_source in ('gps', 'pin', 'demo'))");
    expect(sql).toContain("create or replace function public.stamp_post_source(p_post_id uuid, p_source text)");
    expect(sql).toContain("author_id = auth.uid()");
    expect(sql).toContain("create or replace function public.cancel_claim(p_shop_id uuid)");
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.cancel_claim(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.cancel_claim(uuid) to authenticated");
    expect(sql).not.toContain("grant execute on function public.cancel_claim(uuid) to anon");
    expect(sql).not.toContain("delete from public.shops");
    expect(sql).not.toContain("eyJ");
    expect(sql.toLowerCase()).not.toContain("service_role");
  });
});
