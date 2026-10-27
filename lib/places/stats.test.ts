import { afterEach, describe, expect, it } from "vitest";
import { getPlaceStats, mapStatsRow } from "./stats";

describe("place stats", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  });

  it("maps one stats row", () => {
    expect(
      mapStatsRow({ places_added: 123, countries: 4, moments_seeded: 9, live_now: 2 }),
    ).toEqual({ placesAdded: 123, countries: 4, momentsSeeded: 9, liveNow: 2 });
  });

  it("returns zeros without env and when the query throws", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    await expect(getPlaceStats()).resolves.toEqual({
      placesAdded: 0,
      countries: 0,
      momentsSeeded: 0,
      liveNow: 0,
    });
    await expect(getPlaceStats(async () => {
      throw new Error("stats");
    })).resolves.toEqual({
      placesAdded: 0,
      countries: 0,
      momentsSeeded: 0,
      liveNow: 0,
    });
  });
});
