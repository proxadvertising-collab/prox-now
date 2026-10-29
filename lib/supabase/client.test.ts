import { describe, expect, it } from "vitest";
import {
  authCookieNames,
  clientSkipsLogin,
  pickAuthStorage,
  sessionPersistence,
  shouldClearTabSession,
} from "./client";

function memory(): Storage {
  const jar = new Map<string, string>();
  return {
    get length() {
      return jar.size;
    },
    clear() {
      jar.clear();
    },
    getItem(key: string) {
      return jar.get(key) ?? null;
    },
    key(index: number) {
      return [...jar.keys()][index] ?? null;
    },
    removeItem(key: string) {
      jar.delete(key);
    },
    setItem(key: string, value: string) {
      jar.set(key, value);
    },
  };
}

describe("keep me signed in", () => {
  it("picks local storage when the box is on and session storage when it is off", () => {
    const stores = { local: memory(), session: memory() };
    expect(sessionPersistence(true)).toBe("local");
    expect(sessionPersistence(false)).toBe("session");
    expect(pickAuthStorage(true, stores)).toBe(stores.local);
    expect(pickAuthStorage(false, stores)).toBe(stores.session);
  });

  it("does not treat a closed tab as signed in and does not loop", () => {
    expect(clientSkipsLogin("session", "1")).toBe(true);
    expect(clientSkipsLogin("session", null)).toBe(false);
    expect(clientSkipsLogin("local", "1")).toBe(false);
    expect(shouldClearTabSession("session", null)).toBe(true);
    expect(shouldClearTabSession("session", "1")).toBe(false);
    expect(shouldClearTabSession("local", null)).toBe(false);
    expect(authCookieNames("prox-keep=0; sb-abc-auth-token=1; theme=dark")).toEqual([
      "sb-abc-auth-token",
    ]);
  });
});
