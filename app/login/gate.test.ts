import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loginDest, openingDest, serverSignedIn, signedInDest } from "./gate";

const root = resolve(import.meta.dirname, "../..");

describe("sign-in gate", () => {
  it("sends a signed-out open to login and a signed-in open to the map", () => {
    expect(openingDest(false)).toBe("/login");
    expect(openingDest(true)).toBe("/map");
    expect(serverSignedIn(false, undefined)).toBe(false);
    expect(serverSignedIn(true, undefined)).toBe(true);
    expect(serverSignedIn(true, "1")).toBe(true);
    expect(serverSignedIn(true, "0")).toBe(false);
  });

  it("skips login when a session exists and never sends that person back", () => {
    expect(loginDest(false, "/map")).toBeNull();
    expect(loginDest(true, null)).toBe("/map");
    expect(loginDest(true, "/snap")).toBe("/snap");
    expect(loginDest(true, "/login")).toBe("/map");
    expect(loginDest(true, "/login?next=/login")).toBe("/map");
    expect(signedInDest("/wallet?id=1")).toBe("/wallet?id=1");
    let dest = "/login";
    for (let i = 0; i < 3; i += 1) {
      const next = loginDest(true, dest);
      expect(next).toBe("/map");
      expect(next === "/login").toBe(false);
      dest = next ?? "/login";
    }
  });

  it("keeps the home splash and the Google button out of the pages", () => {
    const home = readFileSync(resolve(root, "app/page.tsx"), "utf8");
    const start = readFileSync(resolve(root, "app/start/page.tsx"), "utf8");
    const login = readFileSync(resolve(root, "app/login/page.tsx"), "utf8");
    const form = readFileSync(resolve(root, "app/login/login-form.tsx"), "utf8");
    expect(start).toContain("openingDest");
    expect(home).toContain('href="/judge" className="btn-primary');
    expect(home).toContain('href="/judge"');
    expect(home).not.toContain('href="/start"');
    expect(home).not.toContain('href="/map"');
    expect(home).toContain("Try it");
    expect(home).not.toContain("wonder-full");
    expect(home).not.toContain("openingDest");
    expect(login).toContain("loginDest");
    expect(login).toContain("Judges: try the demo");
    expect(login).toContain('href="/judge"');
    expect(login).not.toContain("demo.try");
    expect(login).not.toContain("auth.google");
    expect(form).toContain('type="email"');
    expect(form).toContain('type="password"');
    expect(form).toContain('type="checkbox"');
    expect(form).toContain("Keep me signed in");
    expect(form).toContain('type="submit"');
    expect(form).not.toContain('type="button"');
    expect(form).toContain("signInWithPassword");
    expect(form).toContain("keepSignedIn: keep");
    expect(form).toContain("useState(true)");
    expect(form).not.toContain("signInWithOAuth");
    expect(form).not.toContain("auth.google");
    expect(form).not.toContain("Google");
  });
});
