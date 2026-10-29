import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Same order as the book inputs. iOS empties the live list when value is cleared. */
function takeInputFiles(input: { files: ArrayLike<File> | null; value: string }): File[] {
  const files = Array.from(input.files ?? []);
  input.value = "";
  return files;
}

describe("book file input", () => {
  it("passes the picked files after the input is cleared", () => {
    const front = new File(["front"], "front.jpg", { type: "image/jpeg" });
    const menu = new File(["menu"], "menu.jpg", { type: "image/jpeg" });
    const live: File[] = [front, menu];
    const input = {
      files: live,
      stored: "C:\\fakepath\\front.jpg",
      get value() {
        return this.stored;
      },
      set value(next: string) {
        this.stored = next;
        if (next === "") live.splice(0, live.length);
      },
    };

    const files = takeInputFiles(input);

    expect(input.value).toBe("");
    expect(live).toEqual([]);
    expect(files).toEqual([front, menu]);
  });

  it("copies the file list before clearing every book input", () => {
    const sources = ["components/book/BookBuilder.tsx", "components/book/BookAddPhotos.tsx"].map((path) =>
      readFileSync(resolve(root, path), "utf8"),
    );
    const handlers = sources.flatMap((source) => source.split("onChange={(event) => {").slice(1));
    expect(handlers).toHaveLength(3);
    for (const handler of handlers) {
      const body = handler.slice(0, handler.indexOf("}"));
      const copied = body.indexOf("Array.from(event.target.files ?? [])");
      const cleared = body.indexOf('event.target.value = ""');
      expect(copied).toBeGreaterThanOrEqual(0);
      expect(cleared).toBeGreaterThan(copied);
      expect(body).not.toContain("event.target.files;");
    }
    expect(sources[0]).toContain("function queue(kind: BookTile, files: File[])");
    expect(sources[1]).toContain("async function onFiles(files: File[])");
  });
});
