import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const forbidden = ["proxgetlocal", "prox-prod", "creativeloophole", "loophole"];
const loopholeAllow = "docs/PROVENANCE.md";

/** @param {string} rel @param {string} text */
export function auditText(rel, text) {
  const file = rel.replaceAll("\\", "/");
  /** @type {string[]} */
  const hits = [];
  for (const word of forbidden) {
    if (!text.includes(word)) continue;
    if (word === "loophole" && file === loopholeAllow) continue;
    hits.push(`${file}: contains ${word}`);
  }
  return hits;
}

/** @param {string[]} tracked @param {string} allowText */
export function unlistedPublicFiles(tracked, allowText) {
  const allowed = new Set();
  for (const line of allowText.split(/\r?\n/)) {
    const match = line.match(/^-\s+(\S+)\s*$/);
    if (match) allowed.add(match[1].replace(/^\.\//, ""));
  }
  /** @type {string[]} */
  const hits = [];
  for (const rel of tracked) {
    const file = rel.replaceAll("\\", "/");
    if (!file.startsWith("public/")) continue;
    const name = file.slice("public/".length);
    if (!allowed.has(name)) hits.push(`${file} is not listed in public/ASSETS.md`);
  }
  return hits;
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function main() {
  const files = trackedFiles();
  /** @type {string[]} */
  const hits = [];
  for (const rel of files) {
    const text = readFileSync(path.join(root, rel));
    hits.push(...auditText(rel, text.toString("utf8")));
  }
  const allowPath = path.join(root, "public", "ASSETS.md");
  hits.push(...unlistedPublicFiles(files, readFileSync(allowPath, "utf8")));
  if (hits.length > 0) {
    console.error(hits.join("\n"));
    process.exit(1);
  }
  console.log("audit-fresh ok");
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
