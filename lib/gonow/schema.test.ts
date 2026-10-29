import { describe, expect, it } from "vitest";
import { parsePicks } from "./schema";

describe("go-now picks", () => {
  it("drops a pick whose shop_id is not in the context", () => {
    const picks = parsePicks(
      {
        picks: [
          { shop_id: "real", reason: "Thai tea 40฿", walk_minutes: 4 },
          { shop_id: "invented", reason: "best noodles in town", walk_minutes: 2 },
          { shop_id: "real", reason: "again", walk_minutes: 4 },
        ],
      },
      new Set(["real"]),
    );
    expect(picks).toEqual([{ shopId: "real", reason: "Thai tea 40฿", walkMinutes: 4 }]);
  });
});
