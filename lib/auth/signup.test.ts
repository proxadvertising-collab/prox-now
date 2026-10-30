import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accountDest, signUpFailure } from "./signup";

describe("create account", () => {
  it("lands on the page they were opening, or the camera", () => {
    expect(accountDest(null)).toBe("/snap");
    expect(accountDest("")).toBe("/snap");
    expect(accountDest("/wallet")).toBe("/wallet");
    expect(accountDest("/book/mala?seeded=1")).toBe("/book/mala?seeded=1");
    expect(accountDest("/login")).toBe("/map");
  });

  it("explains a taken email, a weak password, and a confirmation mail", () => {
    expect(signUpFailure("User already registered")).toBe("taken");
    expect(signUpFailure("Password should be at least 6 characters")).toBe("weak");
    expect(signUpFailure("Email not confirmed")).toBe("confirm");
    expect(signUpFailure("network down")).toBe("failed");
  });

  it("offers Create account beside Sign in and still uses the password client", () => {
    const form = readFileSync(resolve(process.cwd(), "app/login/login-form.tsx"), "utf8");
    expect(form).toContain("auth.create");
    expect(form).toContain("signUp(");
    expect(form).toContain("signInWithPassword");
    expect(form).toContain("createDest");
    expect(form).not.toContain("signInWithOAuth");
    expect(form).not.toContain("Google");
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
    expect(page).toContain('href="/judge"');
    expect(page).toContain("accountDest");
  });
});
