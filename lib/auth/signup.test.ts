import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CODE_COOLDOWN_S,
  accountDest,
  canResend,
  codeDigits,
  codeReady,
  codeStepAfterSignUp,
  resendPlan,
  signInNeedsCode,
  signUpFailure,
  tickCooldown,
  verifyOutcome,
} from "./signup";

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
    expect(form).toContain("verifyOtp");
    expect(form).toContain('type: "email"');
    expect(form).toContain('type: "signup"');
    expect(form).toContain('inputMode="numeric"');
    expect(form).toContain('autoComplete="one-time-code"');
    expect(form).toContain("Use a different email");
    expect(form).toContain("codeStepAfterSignUp");
    expect(form).toContain("signInNeedsCode");
    expect(form).not.toContain("window.open");
    expect(form).not.toContain("auth.confirm");
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
    expect(page).toContain('href="/judge"');
    expect(page).toContain("accountDest");
  });

  it("shows the code step when sign-up has no session, and signs in when the code is right", () => {
    expect(codeStepAfterSignUp(null)).toBe(true);
    expect(codeStepAfterSignUp(undefined)).toBe(true);
    expect(codeStepAfterSignUp({ access_token: "live" })).toBe(false);
    expect(verifyOutcome(true)).toBe("signed-in");
    expect(codeDigits("12 34-56xx")).toBe("123456");
    expect(codeReady("123456")).toBe(true);
    expect(codeReady("12345")).toBe(false);
  });

  it("shows an error for a wrong code and waits 60 seconds before another code", () => {
    expect(verifyOutcome(false)).toBe("mismatch");
    expect(CODE_COOLDOWN_S).toBe(60);
    expect(canResend(60)).toBe(false);
    expect(canResend(1)).toBe(false);
    expect(resendPlan(45)).toEqual({ send: false, cooldown: 45 });
    expect(resendPlan(0)).toEqual({ send: true, cooldown: 60 });
    expect(tickCooldown(60)).toBe(59);
    expect(tickCooldown(0)).toBe(0);
  });

  it("sends an unconfirmed sign-in to the code step", () => {
    expect(signInNeedsCode("Email not confirmed")).toBe(true);
    expect(signInNeedsCode("Invalid login credentials", "email_not_confirmed")).toBe(true);
    expect(signInNeedsCode("Invalid login credentials")).toBe(false);
  });
});
