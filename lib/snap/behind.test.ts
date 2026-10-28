import { describe, expect, it } from "vitest";
import { showBehind } from "./behind";

describe("behind the scenes visibility", () => {
  it("stays hidden for a normal visit and shows for a judge, a switch, or the query", () => {
    const hidden = { demoSession: false, deviceOn: false, queryOn: false };
    expect(showBehind(hidden)).toBe(false);
    expect(showBehind({ ...hidden, demoSession: true })).toBe(true);
    expect(showBehind({ ...hidden, deviceOn: true })).toBe(true);
    expect(showBehind({ ...hidden, queryOn: true })).toBe(true);
  });
});
