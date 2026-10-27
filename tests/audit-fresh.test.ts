import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { auditText, unlistedPublicFiles } from "../scripts/audit-fresh.mjs";

describe("audit-fresh", () => {
  it("flags foreign product names and allows the separate-product note", () => {
    expect(auditText("docs/PROVENANCE.md", "loophole is a separate product")).toEqual([]);
    expect(auditText("README.md", "see loophole")).toEqual(["README.md: contains loophole"]);
    expect(auditText("lib/a.ts", "proxgetlocal")).toEqual(["lib/a.ts: contains proxgetlocal"]);
    expect(auditText("lib/a.ts", "prox-prod")).toEqual(["lib/a.ts: contains prox-prod"]);
    expect(auditText("lib/a.ts", "creativeloophole")).toEqual([
      "lib/a.ts: contains creativeloophole",
      "lib/a.ts: contains loophole",
    ]);
  });

  it("flags a public file that the allowlist does not name", () => {
    const allow = "- file.svg\n- ASSETS.md\n";
    expect(
      unlistedPublicFiles(["public/file.svg", "public/extra.svg", "public/ASSETS.md"], allow),
    ).toEqual(["public/extra.svg is not listed in public/ASSETS.md"]);
  });

  it("passes on this repository", () => {
    const out = execFileSync(process.execPath, ["scripts/audit-fresh.mjs"], { encoding: "utf8" });
    expect(out.trim()).toBe("audit-fresh ok");
  });
});
