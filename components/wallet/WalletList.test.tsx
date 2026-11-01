import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scratch card", () => {
  it("reveals the code from a text button and keeps the scratch foil", () => {
    const source = readFileSync(new URL("./WalletList.tsx", import.meta.url), "utf8");
    const card = source.slice(source.indexOf("function ScratchCard"), source.indexOf("export function WalletList"));
    expect(card).toContain('t("en", "loop.reveal")');
    expect(card).toContain("onClick={() => onReveal()}");
    expect(card).toContain("onPointerMove");
    expect(card).toContain('aria-label={t("en", "loop.scratch")}');
  });
});
