import { describe, expect, it } from "vitest";
import {
  BOOK_IP_LIMIT,
  BOOK_USER_LIMIT,
  HOUR_MS,
  SNAP_IP_LIMIT,
  DEMO_SNAP_USER_LIMIT,
  RESET_IP_LIMIT,
  SNAP_USER_LIMIT,
  allowBook,
  allowReset,
  allowJudge,
  allowSnap,
  databaseRateAnswer,
  resetRateWindows,
  take,
  type RateBucket,
} from "./window";

describe("rate window", () => {
  it("allows 20 snaps for one person and the 21st waits", async () => {
    resetRateWindows();
    for (let i = 0; i < SNAP_USER_LIMIT; i += 1) {
      expect(await allowSnap("203.0.113.8", "user-a", 1_000)).toBe(true);
    }
    expect(await allowSnap("203.0.113.8", "user-a", 1_000)).toBe(false);
    expect(await allowSnap("203.0.113.8", "user-b", 1_000)).toBe(true);
  });

  it("allows 60 snaps from one address and opens again after an hour", async () => {
    resetRateWindows();
    for (let i = 0; i < SNAP_IP_LIMIT; i += 1) {
      expect(await allowSnap("203.0.113.9", null, 5_000)).toBe(true);
    }
    expect(await allowSnap("203.0.113.9", null, 5_000)).toBe(false);
    expect(await allowSnap("203.0.113.9", null, 5_000 + HOUR_MS)).toBe(true);
  });

  it("limits judge entry by address without spending a snap", async () => {
    resetRateWindows();
    const store = new Map<string, { start: number; count: number }>();
    expect(take(store, [{ key: "ip:1", limit: 1 }], 0)).toBe(true);
    expect(take(store, [{ key: "ip:1", limit: 1 }], 10)).toBe(false);
    expect(await allowJudge("203.0.113.10", 0)).toBe(true);
    expect(await allowSnap("203.0.113.10", null, 0)).toBe(true);
  });

  it("keeps a database answer and does not spend the process window", async () => {
    resetRateWindows();
    const seen: string[] = [];
    const read = async (bucket: RateBucket, subjects: readonly string[]) => {
      seen.push(bucket + ":" + subjects.join(","));
      return seen.length === 1;
    };
    expect(await allowSnap("203.0.113.8", "user-a", 1_000, read)).toBe(true);
    expect(await allowSnap("203.0.113.8", "user-a", 1_000, read)).toBe(false);
    expect(seen[0]).toBe("snap:user:user-a,ip:203.0.113.8");
    expect(await allowSnap("203.0.113.8", "user-a", 1_000)).toBe(true);
    expect(await allowJudge("203.0.113.8", 1_000, async () => false)).toBe(false);
  });

  it("keeps book uploads in their own bucket", async () => {
    resetRateWindows();
    for (let i = 0; i < SNAP_USER_LIMIT; i += 1) {
      expect(await allowSnap("203.0.113.40", "user-a", 4_000)).toBe(true);
    }
    expect(await allowSnap("203.0.113.40", "user-a", 4_000)).toBe(false);
    for (let i = 0; i < BOOK_USER_LIMIT; i += 1) {
      expect(await allowBook("203.0.113.40", "user-a", 4_000)).toBe(true);
    }
    expect(await allowBook("203.0.113.40", "user-a", 4_000)).toBe(false);
    expect(await allowSnap("203.0.113.40", "user-b", 4_000)).toBe(true);

    resetRateWindows();
    for (let i = 0; i < BOOK_IP_LIMIT; i += 1) {
      expect(await allowBook("203.0.113.41", null, 5_000)).toBe(true);
    }
    expect(await allowBook("203.0.113.41", null, 5_000)).toBe(false);
    expect(await allowBook("203.0.113.41", null, 5_000 + HOUR_MS)).toBe(true);
    expect(await allowSnap("203.0.113.41", null, 5_000)).toBe(true);
  });

  it("allows 200 snaps for one demo account and still stops a normal account at 20", async () => {
    resetRateWindows();
    for (let i = 0; i < SNAP_USER_LIMIT; i += 1) {
      expect(await allowSnap("203.0.113.50", "normal-user", 8_000, async () => null, false)).toBe(true);
    }
    expect(await allowSnap("203.0.113.50", "normal-user", 8_000, async () => null, false)).toBe(false);
    const deny = async () => false;
    for (let i = 0; i < DEMO_SNAP_USER_LIMIT; i += 1) {
      expect(await allowSnap("203.0.113." + String(80 + (i % 20)), "demo-user", 8_000, deny, true)).toBe(true);
    }
    expect(await allowSnap("203.0.113.200", "demo-user", 8_000, deny, true)).toBe(false);
    expect(await allowSnap("203.0.113.201", "demo-other", 8_000, deny, true)).toBe(true);
  });

  it("allows 30 end-demo resets from one address", async () => {
    resetRateWindows();
    for (let i = 0; i < RESET_IP_LIMIT; i += 1) {
      expect(await allowReset("203.0.113.77", 9_000)).toBe(true);
    }
    expect(await allowReset("203.0.113.77", 9_000)).toBe(false);
    expect(RESET_IP_LIMIT).toBe(30);
    expect(await allowReset("203.0.113.78", 9_000)).toBe(true);
  });

  it("treats an unknown book bucket as a local count, not a denial", () => {
    expect(databaseRateAnswer("bad_bucket", null)).toBeNull();
    expect(databaseRateAnswer("function take_rate_limit(text, text[]) does not exist", null)).toBeNull();
    expect(databaseRateAnswer("permission denied", null)).toBe(false);
    expect(databaseRateAnswer(null, true)).toBe(true);
    expect(databaseRateAnswer(null, false)).toBe(false);
  });
});
