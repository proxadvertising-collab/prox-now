import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a single-slash path", () => {
    expect(safeNext("/map")).toBe("/map");
    expect(safeNext("/wallet?id=1")).toBe("/wallet?id=1");
    expect(safeNext("/snap")).toBe("/snap");
    expect(safeNext("/auth/callback")).toBe("/auth/callback");
    expect(safeNext("/map#here")).toBe("/map#here");
    expect(safeNext("/me", "/login")).toBe("/me");
  });

  it("rejects open redirects", () => {
    const cases = [
      null,
      undefined,
      "",
      "map",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "/\\\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "http://evil.example/map",
      "javascript:alert(1)",
      "https:evil.example",
      "/map/\\evil",
      "/https://evil.example",
      " /\t/map",
    ];
    for (const value of cases) {
      expect(safeNext(value)).toBe("/map");
    }
    expect(safeNext(null, "/login")).toBe("/login");
  });
});
