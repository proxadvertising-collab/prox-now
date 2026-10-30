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

  it("keeps user photo file inputs off the nav, and offers upload on the camera and book", () => {
    const closed = [
      "components/book/BookAddPhotos.tsx",
      "components/snap/SnapFlow.tsx",
      "components/shell/BottomNav.tsx",
      "app/(app)/snap/page.tsx",
    ];
    for (const path of closed) {
      expect(readFileSync(resolve(root, path), "utf8").includes('type="file"')).toBe(false);
    }
    for (const path of ["components/camera/LiveCamera.tsx", "components/book/BookBuilder.tsx"]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source.includes('type="file"')).toBe(true);
      expect(source.includes('accept="image/*"')).toBe(true);
      expect(source.includes("multiple")).toBe(true);
      expect(source.includes('capture="environment"')).toBe(false);
    }
  });
});
