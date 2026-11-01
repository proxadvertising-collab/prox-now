import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_CENTER } from "@/lib/fixtures/shops";
import { readTour, startJudgeTour, TOUR_KEY } from "@/lib/judge/script";
import { mapAskPoint } from "./ask-point";
import { completeAsk } from "./GoNowSheet";

function tourWindow() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    dispatchEvent: () => true,
  });
  return store;
}

describe("map ask", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks coffee and brunch from the demo center when there is no geolocation", async () => {
    const point = mapAskPoint({ fixtures: false, demoSession: true, userPoint: null, origin: null });
    expect(point).toEqual(DEMO_CENTER);
    const map = readFileSync(new URL("./ProxMap.tsx", import.meta.url), "utf8");
    expect(map).toContain("const askAt = mapAskPoint(");
    expect(map).toContain("origin: askAt");
    expect(map).toContain("lat={askAt?.lat ?? null}");
    expect(map).toContain("lng={askAt?.lng ?? null}");
    expect(map).not.toContain("userPoint ?? origin");

    const store = tourWindow();
    startJudgeTour({ cafe: "a", role: "shopper", step: "ask" });
    const calls: Array<{ url: string; body: { q: string; lat: number; lng: number } }> = [];
    const result = await completeAsk(point?.lat ?? null, point?.lng ?? null, "coffee and brunch", (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as { q: string; lat: number; lng: number } });
      return new Response(JSON.stringify({ mode: "picks", picks: [], nearby: [] }), { status: 200 });
    }) as typeof fetch);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { url: "/api/go-now", body: { q: "coffee and brunch", lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng } },
    ]);
    expect(readTour()?.step).toBe("translate");
    expect(JSON.parse(store.get(TOUR_KEY) ?? "{}").step).toBe("translate");
    expect(result.ok ? result.answer.mode : "").not.toBe("");
  });

  it("still asks the judge to turn location on when there is no point at all", async () => {
    const point = mapAskPoint({ fixtures: false, demoSession: false, userPoint: null, origin: null });
    expect(point).toBeNull();
    const result = await completeAsk(null, null, "coffee and brunch", vi.fn() as typeof fetch);
    expect(result).toEqual({ ok: false, note: "Turn on location, then ask again." });
  });
});
