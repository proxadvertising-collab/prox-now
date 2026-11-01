import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "@/lib/copy";
import { JudgeNotReset } from "./page";

describe("judge page", () => {
  it("shows that a demo session was not reset", async () => {
    const warned = renderToStaticMarkup(
      await JudgeNotReset({ searchParams: Promise.resolve({ notReset: "1" }) }),
    );
    expect(warned).toContain(t("en", "judge.notReset"));
    expect(await JudgeNotReset({ searchParams: Promise.resolve({}) })).toBeNull();
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain("<Suspense");
    expect(page).toContain("<JudgeNotReset");
    const chrome = readFileSync(new URL("../../components/judge/TourChrome.tsx", import.meta.url), "utf8");
    expect(chrome).toContain('"/judge?notReset=1"');
  });
});
