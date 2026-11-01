import { describe, expect, it, vi } from "vitest";
import { getFix, readFix, writeFix } from "./fix-cache";

function memory() {
  const jar = new Map<string, string>();
  return {
    getItem: (key: string) => jar.get(key) ?? null,
    setItem: (key: string, value: string) => {
      jar.set(key, value);
    },
  };
}

describe("fix cache", () => {
  it("returns a fresh hit and drops a fix older than 120 seconds", () => {
    const storage = memory();
    writeFix({ lat: 12.5, lng: 99.9, accuracy: 8 }, storage, 1_000);
    expect(readFix(1_000 + 119_999, storage)).toEqual({ lat: 12.5, lng: 99.9, accuracy: 8, at: 1_000 });
    expect(readFix(1_000 + 120_000, storage)).toBeNull();
  });

  it("does not prompt when permission is still a prompt and the user did not ask", async () => {
    const locate = vi.fn();
    const storage = memory();
    const point = await getFix({
      userAction: false,
      now: 5_000,
      storage,
      nav: { permissions: { query: async () => ({ state: "prompt" }) } },
      locate,
    });
    expect(point).toBeNull();
    expect(locate).not.toHaveBeenCalled();
    expect(storage.getItem("prox-fix")).toBeNull();
  });

  it("returns null when location is denied", async () => {
    const locate = vi.fn();
    const point = await getFix({
      userAction: true,
      now: 5_000,
      storage: memory(),
      nav: { permissions: { query: async () => ({ state: "denied" }) } },
      locate,
    });
    expect(point).toBeNull();
    expect(locate).not.toHaveBeenCalled();
  });

  it("writes the cache when locate succeeds", async () => {
    const storage = memory();
    const point = await getFix({
      userAction: true,
      now: 9_000,
      storage,
      nav: { permissions: { query: async () => ({ state: "granted" }) } },
      locate: async () => ({ status: "ok", point: { lat: 13.7, lng: 100.5 } }),
    });
    expect(point).toEqual({ lat: 13.7, lng: 100.5, accuracy: null });
    expect(readFix(9_000, storage)).toEqual({ lat: 13.7, lng: 100.5, accuracy: null, at: 9_000 });
  });

  it("returns a fresh cache hit without calling locate", async () => {
    const storage = memory();
    writeFix({ lat: 1, lng: 2, accuracy: 4 }, storage, 10);
    const locate = vi.fn();
    const point = await getFix({
      userAction: false,
      now: 20,
      storage,
      nav: { permissions: { query: async () => ({ state: "prompt" }) } },
      locate,
    });
    expect(point).toEqual({ lat: 1, lng: 2, accuracy: 4 });
    expect(locate).not.toHaveBeenCalled();
  });
});
