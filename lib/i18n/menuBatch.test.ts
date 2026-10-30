import { describe, expect, it, vi } from "vitest";
import { menuCacheKey } from "./device";
import { chunkNames, createMenuBatcher, readTranslations } from "./menuBatch";

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

function manualSchedule() {
  const jobs: Array<() => void> = [];
  return { schedule: (run: () => void) => void jobs.push(run), flush: () => jobs.splice(0).forEach((run) => run()) };
}

function reply(translations: string[]) {
  return new Response(JSON.stringify({ translations }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("menu title batcher", () => {
  it("sends one request for every title on a card, skips cached ones, and fills the same cache keys", async () => {
    const store = memoryStore({ [menuCacheKey("Pad thai", "th")]: "ผัดไทย" });
    const timer = manualSchedule();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { texts: string[] };
      return reply(body.texts.map((text) => "TH:" + text));
    });
    const batcher = createMenuBatcher({ fetcher, store: () => store, schedule: timer.schedule });
    const cached = batcher.request("Pad thai", "th");
    const a = batcher.request("Fried rice", "th");
    const b = batcher.request("Iced tea", "th-TH");
    const again = batcher.request("Fried rice", "th");
    timer.flush();
    expect(await cached).toBe("ผัดไทย");
    expect(await a).toBe("TH:Fried rice");
    expect(await b).toBe("TH:Iced tea");
    expect(await again).toBe("TH:Fried rice");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ texts: ["Fried rice", "Iced tea"], to: "th" });
    expect(store.getItem(menuCacheKey("Iced tea", "th"))).toBe("TH:Iced tea");
  });

  it("splits a big menu into 25-title chunks", async () => {
    const timer = manualSchedule();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { texts: string[] };
      return reply(body.texts.map((text) => text.toUpperCase()));
    });
    const batcher = createMenuBatcher({ fetcher, store: () => memoryStore(), schedule: timer.schedule });
    const all = Array.from({ length: 60 }, (_, index) => batcher.request("dish " + index, "th"));
    timer.flush();
    const results = await Promise.all(all);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(results[59]).toBe("DISH 59");
  });

  it("never calls the API for English and resolves null when the network fails", async () => {
    const timer = manualSchedule();
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    const store = memoryStore();
    const batcher = createMenuBatcher({ fetcher, store: () => store, schedule: timer.schedule });
    expect(await batcher.request("Fried rice", "en")).toBeNull();
    const pending = batcher.request("Fried rice", "th");
    timer.flush();
    expect(await pending).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("only trusts a reply with one string per title", () => {
    expect(readTranslations({ translations: ["a", "b"] }, 2)).toEqual(["a", "b"]);
    expect(readTranslations({ translations: ["a"] }, 2)).toBeNull();
    expect(readTranslations(null, 1)).toBeNull();
    expect(chunkNames(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });
});
