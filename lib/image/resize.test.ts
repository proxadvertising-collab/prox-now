import { describe, expect, it } from "vitest";
import { fitWithin } from "./resize";

describe("fitWithin", () => {
  it("scales the long edge down and leaves smaller photos alone", () => {
    expect(fitWithin(2000, 1000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(400, 800, 1024)).toEqual({ width: 400, height: 800 });
    expect(fitWithin(100, 100, 1024)).toEqual({ width: 100, height: 100 });
    expect(fitWithin(0, 400, 1024)).toEqual({ width: 0, height: 0 });
  });
});
