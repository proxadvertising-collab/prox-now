import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adoptFacing,
  cameraConstraints,
  captureSize,
  drawUnmirrored,
  flipControl,
  flipStream,
  previewClass,
  rememberFacing,
} from "../components/camera/flip";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fakeStream(label: string) {
  const stops: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stops.push(label) }],
  } as unknown as MediaStream;
  return { stream, stops };
}

describe("camera flip", () => {
  it("toggles facingMode and stops the old tracks", async () => {
    rememberFacing("environment");
    const current = fakeStream("old");
    const opened = fakeStream("new");
    const calls: MediaStreamConstraints[] = [];
    const flipped = await flipStream("environment", current.stream, async (constraints) => {
      calls.push(constraints);
      return opened.stream;
    });
    expect(calls).toEqual([cameraConstraints("user")]);
    expect(current.stops).toEqual(["old"]);
    expect(flipped.ok).toBe(true);
    expect(flipped.facing).toBe("user");
    expect(flipped.stream).toBe(opened.stream);

    const back = fakeStream("back");
    const returned = await flipStream("user", opened.stream, async (constraints) => {
      calls.push(constraints);
      return back.stream;
    });
    expect(calls[1]).toEqual(cameraConstraints("environment"));
    expect(returned.facing).toBe("environment");
    expect(opened.stops).toEqual(["new"]);
  });

  it("mirrors the front preview and leaves the capture unmirrored", () => {
    expect(previewClass("user")).toContain("camera-preview-mirror");
    expect(previewClass("environment")).toBe("camera-preview");
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
    expect(css).toContain(".camera-preview-mirror");
    expect(css).toContain("scaleX(-1)");
    const transforms: number[][] = [];
    const drawn: unknown[] = [];
    drawUnmirrored(
      {
        setTransform: (a, b, c, d, e, f) => transforms.push([a, b, c, d, e, f]),
        drawImage: (source) => drawn.push(source),
      },
      { tag: "video" } as unknown as CanvasImageSource,
      12,
      8,
    );
    expect(transforms).toEqual([[1, 0, 0, 1, 0, 0]]);
    expect(drawn).toEqual([{ tag: "video" }]);
    const camera = readFileSync(resolve(root, "components/camera/LiveCamera.tsx"), "utf8");
    expect(camera).toContain("previewClass(facing)");
    expect(camera).toContain("drawUnmirrored");
    expect(camera).toContain("captureSize");
    expect(camera).toContain('toBlob(resolve, "image/jpeg", 0.85)');
    expect(camera).not.toContain("|| 1280");
    expect(camera).not.toContain("scaleX(-1)");
  });

  it("requests 1920x1440 and keeps the full frame unless the long side exceeds 2000", () => {
    expect(cameraConstraints("environment")).toEqual({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    expect(cameraConstraints("user").video).toMatchObject({ width: { ideal: 1920 }, height: { ideal: 1440 } });
    expect(captureSize(480, 640)).toEqual({ width: 480, height: 640 });
    expect(captureSize(1920, 1440)).toEqual({ width: 1920, height: 1440 });
    expect(captureSize(100, 100)).toEqual({ width: 100, height: 100 });
    expect(captureSize(3000, 2000)).toEqual({ width: 2000, height: 1333 });
    expect(captureSize(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("keeps the old stream when the flip fails", async () => {
    rememberFacing("environment");
    const current = fakeStream("old");
    const failed = await flipStream("environment", current.stream, async () => {
      throw new Error("no front camera");
    });
    expect(failed.ok).toBe(false);
    expect(failed.facing).toBe("environment");
    expect(failed.stream).toBe(current.stream);
    expect(current.stops).toEqual([]);
    expect(flipControl(1, false)).toBe("hide");
    expect(flipControl(2, true)).toBe("disable");
    const seeded = await adoptFacing("environment", "user", current.stream, async () => {
      throw new Error("stay");
    });
    expect(seeded.ok).toBe(false);
    expect(seeded.stream).toBe(current.stream);
    expect(current.stops).toEqual([]);
  });
});
