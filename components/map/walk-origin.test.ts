import { describe, expect, it } from "vitest";
import { getServerWalkOrigin, getWalkOrigin, setWalkOrigin, subscribeWalkOrigin } from "./walk-origin";

describe("walk origin", () => {
  it("starts null, then stores a real fix and notifies subscribers", () => {
    expect(getWalkOrigin()).toBeNull();
    expect(getServerWalkOrigin()).toBeNull();
    const seen: Array<ReturnType<typeof getWalkOrigin>> = [];
    const stop = subscribeWalkOrigin(() => {
      seen.push(getWalkOrigin());
    });
    const point = { lat: 13.75, lng: 100.5 };
    setWalkOrigin(point);
    expect(getWalkOrigin()).toEqual(point);
    expect(getServerWalkOrigin()).toBeNull();
    expect(seen).toEqual([point]);
    stop();
    setWalkOrigin({ lat: 14, lng: 101 });
    expect(seen).toEqual([point]);
    expect(getWalkOrigin()).toEqual({ lat: 14, lng: 101 });
  });
});
