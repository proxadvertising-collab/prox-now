import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { allowImmediatePost, allowNoCodeClaim } from "./shortcuts";

describe("demo shortcuts", () => {
  it("rejects a real shop and a real account", () => {
    expect(allowNoCodeClaim({ shopDemo: false, demoAccount: true })).toBe(false);
    expect(allowNoCodeClaim({ shopDemo: true, demoAccount: false })).toBe(false);
    expect(allowNoCodeClaim({ shopDemo: false, demoAccount: false })).toBe(false);
    expect(allowNoCodeClaim({ shopDemo: true, demoAccount: true })).toBe(true);
    expect(allowImmediatePost({ shopDemo: false, demoAccount: true, requested: true })).toBe(false);
    expect(allowImmediatePost({ shopDemo: true, demoAccount: false, requested: true })).toBe(false);
    expect(allowImmediatePost({ shopDemo: true, demoAccount: true, requested: false })).toBe(false);
    expect(allowImmediatePost({ shopDemo: true, demoAccount: true, requested: true })).toBe(true);
  });

  it("keeps the checks on the server routes", () => {
    const claim = readFileSync(resolve(process.cwd(), "app/api/owner/claim/route.ts"), "utf8");
    const posts = readFileSync(resolve(process.cwd(), "app/api/posts/route.ts"), "utf8");
    expect(claim).toContain("allowNoCodeClaim");
    expect(posts).toContain("allowImmediatePost");
    expect(posts).not.toContain("skipWait === \"1\" && true");
  });
});
