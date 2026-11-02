import { t, type CopyKey } from "@/lib/copy";
import type { SceneReport } from "@/lib/snap/scene";

const STEP_KEY: Record<string, CopyKey> = {
  locate: "ai.step.locate",
  resize: "ai.step.resize",
  shops: "ai.step.shops",
  match: "ai.step.match",
};

function readShopName(scene: SceneReport): string {
  const named = scene.readName?.trim();
  if (named) return named;
  const sign = scene.signs.find((line) => line.original.trim());
  return sign?.original.trim() ?? "";
}

export function ScenePanel({ scene }: { scene: SceneReport }) {
  const matchName = scene.shopName || scene.shopId;
  const read = readShopName(scene);
  return (
    <details open className="rounded-lg bg-surface-1 p-3">
      <summary className="min-h-11 cursor-pointer text-label font-semibold text-fg">{t("en", "ai.behind")}</summary>
      <dl className="mt-2 flex flex-col gap-1 text-label text-fg">
        <div>{scene.model ? t("en", "ai.model", { name: scene.model }) : t("en", "ai.modelMissing")}</div>
        <div>
          {matchName
            ? t("en", "ai.match", { name: matchName })
            : read
              ? t("en", "ai.newShop", { name: read })
              : t("en", "ai.noMatch")}
        </div>
        {scene.confidence > 0 ? <div>{t("en", "ai.confidence", { n: String(scene.confidence) })}</div> : null}
        <div>{t("en", "ai.faces", { n: String(scene.facesFound) })}</div>
        <div>
          {scene.facesBlurred === null
            ? t("en", "ai.blurWait")
            : t("en", "ai.blurred", { n: String(scene.facesBlurred) })}
        </div>
        {scene.signs.length === 0 ? <div>{t("en", "ai.signNone")}</div> : null}
        {scene.signs.map((line) => (
          <div key={line.original + ":" + line.translated}>
            {line.original} → {line.translated}
          </div>
        ))}
        <div>
          {scene.languages
            ? t("en", "ai.langs", { source: scene.languages.source, target: scene.languages.target })
            : t("en", "ai.langsMissing")}
        </div>
        {scene.steps.map((step) => (
          <div key={step.step}>
            {t("en", "ai.stepLine", {
              label: STEP_KEY[step.step] ? t("en", STEP_KEY[step.step]) : step.step,
              ms: String(step.ms),
            })}
          </div>
        ))}
      </dl>
    </details>
  );
}
