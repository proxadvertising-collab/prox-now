import { describe, expect, it } from "vitest";
import { savedMaybe, waitForBook } from "./waitBook";

const noSleep = async () => {};

describe("waitForBook", () => {
  it("returns the slug once the book is live", async () => {
    let calls = 0;
    const slug = await waitForBook("s", async () => (++calls < 3 ? { live: false, slug: "x" } : { live: true, slug: "cafe-ec976d" }), 5, 0, noSleep);
    expect(slug).toBe("cafe-ec976d");
    expect(calls).toBe(3);
  });
  it("gives up after the tries and survives probe errors", async () => {
    let calls = 0;
    const slug = await waitForBook("s", async () => { calls++; throw new Error("net"); }, 4, 0, noSleep);
    expect(slug).toBeNull();
    expect(calls).toBe(4);
  });
  it("treats timeouts and network loss as maybe saved", () => {
    expect(savedMaybe(504)).toBe(true);
    expect(savedMaybe(null)).toBe(true);
    expect(savedMaybe(400)).toBe(false);
    expect(savedMaybe(500)).toBe(false);
  });
});
