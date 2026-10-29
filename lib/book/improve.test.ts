import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fallbackDecision, improveSummary, parseImproveDecision } from "./improve";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("improve a book", () => {
  it("skips the same info, replaces a changed single page, and adds a new item", () => {
    const hours = { id: "hours-1", extracted: { hours: "Mon 8-5" } };
    const menu = { id: "menu-1", extracted: { items: [{ name: "Pad Thai", price: "50" }] } };
    expect(fallbackDecision("hours", hours.extracted, [hours])).toEqual({ action: "skip", pageId: "hours-1" });
    expect(fallbackDecision("hours", { hours: "Mon 9-6" }, [hours])).toEqual({ action: "replace", pageId: "hours-1" });
    expect(fallbackDecision("menu", { items: [{ name: "Mango", price: "40" }] }, [menu])).toEqual({
      action: "add",
      pageId: null,
    });
    expect(parseImproveDecision({ action: "replace", pageId: "menu-1" }, ["menu-1"])).toEqual({
      action: "replace",
      pageId: "menu-1",
    });
    expect(parseImproveDecision({ action: "replace", pageId: "missing" }, ["menu-1"])).toBeNull();
    expect(parseImproveDecision({ action: "add", pageId: null }, [])).toEqual({ action: "add", pageId: null });
    expect(parseImproveDecision({ action: "skip", pageId: null }, [])).toEqual({ action: "skip", pageId: null });
  });

  it("writes the short summary", () => {
    expect(
      improveSummary([
        { kind: "hours", action: "replace" },
        { kind: "menu", action: "add" },
        { kind: "menu", action: "add" },
        { kind: "menu", action: "skip" },
      ]),
    ).toBe("Updated hours, added 2 menu items, 1 skipped as duplicate");
  });

  it("renders extras as their own section", () => {
    const page = readFileSync(resolve(root, "app/(app)/book/[slug]/page.tsx"), "utf8");
    const camera = readFileSync(resolve(root, "components/camera/LiveCamera.tsx"), "utf8");
    expect(page).toContain('page.kind === "extra"');
    expect(page).toContain("Extras");
    expect(camera).toContain('shot.slot === "extras" ? "extra"');
    expect(camera).toContain('shop.hasBook ? "improve"');
  });
});
