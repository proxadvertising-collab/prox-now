import { describe, expect, it } from "vitest";
import { t } from "../copy";
import { livePostErrorKey } from "./publish";

describe("live post errors", () => {
  it("maps a full shop and keeps the old message only for an old database", () => {
    expect(t("en", livePostErrorKey("shop_full")!)).toBe(
      "That's 10 photos here for now. They'll free up as each one's 2 hours end.",
    );
    expect(t("th", "post.shopFull").length).toBeGreaterThan(0);
    expect(livePostErrorKey("already_live")).toBe("post.already");
    expect(livePostErrorKey("upstream")).toBeNull();
    expect(livePostErrorKey("")).toBeNull();
  });
});
