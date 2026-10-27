import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { auditText, unlistedPublicFiles } from "../scripts/audit-fresh.mjs";

const separateProduct = "loop" + "hole";
const oldName = "prox" + "getlocal";
const otherRepo = "prox-" + "prod";
const studio = "creative" + separateProduct;

describe("audit-fresh", () => {
  it("flags foreign product names and allows the separate-product note", () => {
    expect(auditText("docs/PROVENANCE.md", separateProduct + " is a separate product")).toEqual([]);
    expect(auditText("README.md", "see " + separateProduct)).toEqual([
      "README.md: contains " + separateProduct,
    ]);
    expect(auditText("lib/a.ts", oldName)).toEqual(["lib/a.ts: contains " + oldName]);
    expect(auditText("lib/a.ts", otherRepo)).toEqual(["lib/a.ts: contains " + otherRepo]);
    expect(auditText("lib/a.ts", studio)).toEqual([
      "lib/a.ts: contains " + studio,
      "lib/a.ts: contains " + separateProduct,
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
