import { describe, expect, it } from "vitest";
import { HOUR_MS, SNAP_IP_LIMIT, SNAP_USER_LIMIT, allowJudge, allowSnap, resetRateWindows, take } from "./window";

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
    const read = async (bucket: "snap" | "judge", subjects: readonly string[]) => {
      seen.push(bucket + ":" + subjects.join(","));
      return seen.length === 1;
    };
    expect(await allowSnap("203.0.113.8", "user-a", 1_000, read)).toBe(true);
    expect(await allowSnap("203.0.113.8", "user-a", 1_000, read)).toBe(false);
    expect(seen[0]).toBe("snap:user:user-a,ip:203.0.113.8");
    expect(await allowSnap("203.0.113.8", "user-a", 1_000)).toBe(true);
    expect(await allowJudge("203.0.113.8", 1_000, async () => false)).toBe(false);
  });
});
