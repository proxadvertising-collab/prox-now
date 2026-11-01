import { describe, expect, it } from "vitest";
import { MetaCallError } from "../../../lib/ai/meta";
import type { ContextShop } from "../../../lib/gonow/context";
import { handleGoNow } from "../../../lib/gonow/handler";

const NOW = new Date("2026-10-29T04:00:00.000Z");

function hours(open: string, close: string) {
  return {
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ d: String(day), open, close })),
    raw: open + "–" + close,
  };
}

function shop(id: string, lat: number, open: boolean): ContextShop {
  return {
    id,
    slug: id + "-shop",
    name: id,
    category: "street_food",
    lat,
    lng: 99.9,
    timezone: "Asia/Bangkok",
    hours: open ? hours("00:00", "23:59") : hours("01:00", "02:00"),
    items: [{ name: "Thai tea", price: "40" }],
    book: true,
  };
}

describe("POST /api/go-now", () => {
  it("returns the nearest open places when the Meta call throws", async () => {
    const response = await handleGoNow(
      new Request("http://localhost/api/go-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Food now", lat: 12.5, lng: 99.9 }),
      }),
      {
        allow: async () => true,
        userId: async () => null,
        now: () => NOW,
        load: async () => ({
          shops: [shop("closed-near", 12.5004, false), shop("open-far", 12.504, true), shop("open-near", 12.501, true)],
          posts: [],
        }),
        call: async () => {
          throw new MetaCallError("upstream");
        },
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("nearby");
    expect(body.picks).toEqual([]);
    expect(body.nearby.map((place: { shopId: string }) => place.shopId)).toEqual(["open-near", "open-far"]);
    expect(JSON.stringify(body).includes("META_API_KEY")).toBe(false);
  });

  it("returns a demo shop at 10:00 Bangkok when nothing is open", async () => {
    const ten = new Date("2026-11-01T03:00:00.000Z");
    const closed = {
      days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ d: String(day), open: "16:00", close: "23:00" })),
      raw: "16:00–23:00",
    };
    const response = await handleGoNow(
      new Request("http://localhost/api/go-now", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: "prox-judge=explorer" },
        body: JSON.stringify({ q: "coffee and brunch", lat: 12.5, lng: 99.9 }),
      }),
      {
        allow: async () => true,
        userId: async () => "demo-shopper",
        now: () => ten,
        demoSession: async () => true,
        load: async () => ({
          shops: [
            { ...shop("real-closed", 12.5, false), demo: false },
            { ...shop("mala-mafia", 12.5002, false), hours: closed, demo: true },
            { ...shop("no-hours", 12.5004, true), hours: null, demo: true },
          ],
          posts: [],
        }),
        call: async () => {
          throw new MetaCallError("upstream");
        },
      },
    );
    const body = await response.json();
    expect(body.nearby.length).toBeGreaterThan(0);
    expect(body.nearby.map((place: { shopId: string }) => place.shopId)).not.toContain("real-closed");
    const reasons = body.nearby.map((place: { reason: string }) => place.reason);
    expect(reasons).toContain("Closed now");
    expect(reasons).toContain("Hours not listed");
  });

  it("still drops closed and unlisted shops outside a demo session", async () => {
    const response = await handleGoNow(
      new Request("http://localhost/api/go-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "coffee", lat: 12.5, lng: 99.9 }),
      }),
      {
        allow: async () => true,
        userId: async () => "user-1",
        now: () => new Date("2026-11-01T03:00:00.000Z"),
        demoSession: async () => false,
        load: async () => ({
          shops: [
            { ...shop("mala-mafia", 12.5002, false), demo: true },
            { ...shop("no-hours", 12.5004, true), hours: null, demo: true },
          ],
          posts: [],
        }),
        call: async () => {
          throw new MetaCallError("upstream");
        },
      },
    );
    const body = await response.json();
    expect(body.mode).toBe("nearby");
    expect(body.nearby).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Hours not listed");
    expect(JSON.stringify(body)).not.toContain("Closed now");
  });
});
