import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { updateSession } from "./session";

describe("updateSession", () => {
  it("returns a pass-through response when Supabase env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await updateSession(undefined as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
