import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { isProtectedPath, updateSession } from "./session";

describe("updateSession", () => {
  it("returns a pass-through response when Supabase env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await updateSession(undefined as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps snap public and still protects wallet and inbox", () => {
    expect(isProtectedPath("/snap")).toBe(false);
    expect(isProtectedPath("/snap/now")).toBe(false);
    expect(isProtectedPath("/map")).toBe(false);
    expect(isProtectedPath("/wallet")).toBe(true);
    expect(isProtectedPath("/inbox/1")).toBe(true);
  });
});
