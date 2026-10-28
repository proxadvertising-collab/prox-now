import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createServiceClient } from "../supabase/admin";

const root = join(import.meta.dirname, "../..");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("service role boundary", () => {
  it("keeps the service client off client components and the book route source", () => {
    const route = readFileSync(join(root, "app/api/book/pages/route.ts"), "utf8");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).toContain("createServiceClient");
    const clientFiles = [
      ...filesUnder(join(root, "components")),
      ...filesUnder(join(root, "app")).filter((path) => !relative(root, path).startsWith("app/api/")),
    ];
    for (const path of clientFiles) {
      const text = readFileSync(path, "utf8");
      expect(text, relative(root, path)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(text, relative(root, path)).not.toContain("lib/supabase/admin");
    }
  });

  it("fails closed when the service env is unset and the message has no key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createServiceClient()).toThrow(/not set/);
  });
});
