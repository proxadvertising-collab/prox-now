import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkDemoStreet } from "./street";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(resolve(root, "supabase/seeds/soi102_demo_street.sql"), "utf8");

describe("Soi 102 demo street seed", () => {
  const check = checkDemoStreet(sql);

  it("only writes rows for is_demo shops", () => {
    expect(check.writes).toBeGreaterThan(0);
    expect(check.demoOnly).toBe(true);
    expect(sql).not.toMatch(/is_demo\s*=\s*false/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.shops\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.shops\b/i);
  });

  it("plants live deals, coupons, and a Mala Mafia book", () => {
    expect(check.postCount).toBeGreaterThanOrEqual(4);
    expect(check.postCount).toBeLessThanOrEqual(6);
    expect(check.couponCount).toBeGreaterThanOrEqual(2);
    expect(check.couponCount).toBeLessThanOrEqual(3);
    expect(sql).toContain("interval '2 hours'");
    expect(check.bookKinds.filter((kind) => kind === "menu")).toHaveLength(3);
    expect(check.bookKinds).toContain("logo");
    expect(check.bookKinds).toContain("hours");
    expect(sql).toContain("theme");
    expect(check.imagePaths.length).toBe(check.bookKinds.length);
    for (const imagePath of check.imagePaths) {
      expect(existsSync(resolve(root, "public", imagePath))).toBe(true);
    }
  });
});
