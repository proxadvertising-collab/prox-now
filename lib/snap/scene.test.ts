import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenePanel } from "@/components/snap/ScenePanel";
import { t } from "../copy";
import { emptyMatcherResult, parseMatcherResult } from "../ai/matcher";
import { analyzeFailure, buildScene, prependSteps, type SceneReport } from "./scene";

describe("behind the scenes", () => {
  it("reads the model, match, faces, sign pair, and step times from the response", () => {
    const raw = {
      shop_id: "mala-mafia",
      confidence: 0.92,
      sign_text: [{ thai: "มาล่า", english: "mala" }],
      faces: [
        [0.1, 0.1, 0.2, 0.2],
        [0.3, 0.3, 0.4, 0.4],
      ],
      facts: { sign_language: "th", captions: { en: "Mala" } },
    };
    const scene = buildScene({
      model: " response-model ",
      result: parseMatcherResult(raw, ["mala-mafia"]),
      raw,
      shopName: "Mala Mafia",
      steps: [
        { step: "shops", ms: 12 },
        { step: "match", ms: 340 },
      ],
    });
    expect(scene.model).toBe("response-model");
    expect(scene.shopName).toBe("Mala Mafia");
    expect(scene.readName).toBeNull();
    expect(scene.confidence).toBe(0.92);
    expect(scene.facesFound).toBe(2);
    expect(scene.facesBlurred).toBeNull();
    expect(scene.signs).toEqual([{ original: "มาล่า", translated: "mala" }]);
    expect(scene.languages).toEqual({ source: "th", target: "en" });
    expect(scene.steps).toEqual([
      { step: "shops", ms: 12 },
      { step: "match", ms: 340 },
    ]);
  });

  it("leaves the model empty when the response has none", () => {
    const scene = buildScene({
      model: null,
      result: emptyMatcherResult(),
      raw: { sign_text: [{ original: "Cafe", translated: "Cafe" }] },
      shopName: null,
      steps: [],
    });
    expect(scene.model).toBeNull();
    expect(scene.languages).toEqual({ source: "original", target: "translated" });
    expect(scene.facesFound).toBe(0);
  });

  it("keeps measured client steps ahead of the server steps", () => {
    const scene = prependSteps(
      buildScene({
        model: null,
        result: emptyMatcherResult(),
        raw: null,
        shopName: null,
        steps: [{ step: "match", ms: 10 }],
      }),
      [
        { step: "locate", ms: 4 },
        { step: "resize", ms: 8 },
      ],
    );
    expect(scene.steps.map((step) => step.step)).toEqual(["locate", "resize", "match"]);
  });

  it("maps a Meta credit or rate failure to the resting message", () => {
    expect(analyzeFailure(503, "ai_resting")).toBe("resting");
    expect(analyzeFailure(503, "busy")).toBe("resting");
    expect(analyzeFailure(503, "ai_not_configured")).toBe("offline");
    expect(analyzeFailure(429, "rate_limited")).toBe("rate");
    expect(analyzeFailure(502, "upstream")).toBe("net");
    expect(analyzeFailure(200, undefined)).toBeNull();
  });

  it("hides a zero confidence and names a shop the photo read", () => {
    const base: SceneReport = {
      model: null,
      shopId: null,
      shopName: null,
      readName: "Farm to Go",
      confidence: 0,
      facesFound: 0,
      facesBlurred: null,
      signs: [],
      languages: null,
      steps: [],
    };
    const named = renderToStaticMarkup(createElement(ScenePanel, { scene: base }));
    expect(named).toContain("New shop: Farm to Go");
    expect(named.includes("Confidence")).toBe(false);
    const blank = renderToStaticMarkup(createElement(ScenePanel, { scene: { ...base, readName: null } }));
    expect(blank).toContain(t("en", "ai.noMatch"));
    expect(blank.includes("Confidence")).toBe(false);
    const matched = renderToStaticMarkup(
      createElement(ScenePanel, { scene: { ...base, shopName: "Dawn Cafe", confidence: 0.4 } }),
    );
    expect(matched).toContain("Match: Dawn Cafe");
    expect(matched).toContain("Confidence: 0.4");
    expect(t("en", "ai.newShop", { name: "Farm to Go" })).toBe("New shop: Farm to Go");
    expect(t("th", "ai.newShop", { name: "ฟาร์ม" })).toBe("ร้านใหม่: ฟาร์ม");
  });

  it("names a matched shop and never uses a menu word as a new shop", () => {
    const base: SceneReport = {
      model: null,
      shopId: null,
      shopName: null,
      readName: "เมนู",
      confidence: 0,
      facesFound: 0,
      facesBlurred: null,
      signs: [{ original: "เมนู", translated: "Menu" }],
      languages: null,
      steps: [],
    };
    const matched = renderToStaticMarkup(
      createElement(ScenePanel, { scene: { ...base, shopName: "Pak Kapi", shopId: "pak-kapi" } }),
    );
    expect(matched).toContain("Match: Pak Kapi");
    expect(matched.includes("New shop")).toBe(false);
    const menuOnly = renderToStaticMarkup(createElement(ScenePanel, { scene: base }));
    expect(menuOnly).toContain(t("en", "ai.noMatch"));
    expect(menuOnly.includes("New shop")).toBe(false);
    const fresh = renderToStaticMarkup(createElement(ScenePanel, { scene: { ...base, readName: "Pak Kapi", signs: [] } }));
    expect(fresh).toContain("New shop: Pak Kapi");
    const longer = renderToStaticMarkup(
      createElement(ScenePanel, { scene: { ...base, readName: "Menu House", signs: [] } }),
    );
    expect(longer).toContain("New shop: Menu House");
  });

  it("does not name a model in the panel copy", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const panel = readFileSync(resolve(root, "components/snap/ScenePanel.tsx"), "utf8");
    const copy = readFileSync(resolve(root, "lib/copy.ts"), "utf8");
    expect(panel.includes("muse-spark")).toBe(false);
    expect(panel.includes("SAM")).toBe(false);
    expect(copy.includes("muse-spark")).toBe(false);
    expect(copy.includes("SAM")).toBe(false);
  });
});
