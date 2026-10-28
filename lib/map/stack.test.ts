import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoStack } from "../../components/map/PhotoStack";
import type { LivePost } from "../posts/source";

function photo(id: string, createdAt: string): LivePost {
  return {
    id,
    shopId: "shop",
    photoUrl: "https://example.test/" + id + ".jpg",
    textOriginal: null,
    textTranslated: {},
    createdAt,
    expiresAt: "2026-10-27T11:30:00.000Z",
    shopName: "Nashville",
    shopNameLocal: null,
    lat: 1,
    lng: 2,
    category: "other",
    facts: null,
    mine: id === "b",
    seed: false,
  };
}

describe("photo stack", () => {
  it("renders the current photo, its time left, and a 2 / 5 counter", () => {
    const photos = ["a", "b", "c", "d", "e"].map((id, index) =>
      photo(id, "2026-10-27T10:0" + String(index) + ":00.000Z"),
    );
    const html = renderToStaticMarkup(
      createElement(PhotoStack, {
        photos,
        now: Date.parse("2026-10-27T10:00:00.000Z"),
        index: 1,
        onIndex: () => undefined,
      }),
    );
    expect(html).toContain("https://example.test/b.jpg");
    expect(html).toContain("1h 30m left");
    expect(html).toContain("2 / 5");
    expect(html).toContain('aria-label="Previous photo"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain('data-reduced="false"');
    expect(html).toContain("translateX(-100%)");
  });
});
