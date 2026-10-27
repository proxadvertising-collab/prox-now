import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyMatcherResult, parseMatcherResult } from "../ai/matcher";
import { buildScene, prependSteps } from "./scene";

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
