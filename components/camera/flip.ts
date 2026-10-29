export type Facing = "user" | "environment";

const SESSION_KEY = "prox-camera-facing";
let memoryFacing: Facing = "environment";

export function facingForSession(): Facing {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === "user" || stored === "environment") return stored;
  } catch {
    /* sessionStorage is unavailable */
  }
  return memoryFacing;
}

export function rememberFacing(facing: Facing): void {
  memoryFacing = facing;
  try {
    sessionStorage.setItem(SESSION_KEY, facing);
  } catch {
    /* sessionStorage is unavailable */
  }
}

export function nextFacing(current: Facing): Facing {
  return current === "environment" ? "user" : "environment";
}

export function cameraConstraints(facing: Facing): MediaStreamConstraints {
  return { video: { facingMode: { ideal: facing } }, audio: false };
}

export function previewClass(facing: Facing): string {
  return facing === "user" ? "camera-preview camera-preview-mirror" : "camera-preview";
}

export function flipControl(cameraCount: number | null, failed: boolean): "hide" | "disable" | "show" {
  if (cameraCount === 1) return "hide";
  if (failed) return "disable";
  return "show";
}

export function drawUnmirrored(
  context: {
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    drawImage: (source: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void;
  },
  source: CanvasImageSource,
  width: number,
  height: number,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(source, 0, 0, width, height);
}

export type FlipResult = {
  facing: Facing;
  stream: MediaStream;
  ok: boolean;
};

export async function flipStream(
  facing: Facing,
  stream: MediaStream,
  open: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): Promise<FlipResult> {
  const next = nextFacing(facing);
  try {
    const opened = await open(cameraConstraints(next));
    for (const track of stream.getTracks()) track.stop();
    rememberFacing(next);
    return { facing: next, stream: opened, ok: true };
  } catch {
    return { facing, stream, ok: false };
  }
}

export async function adoptFacing(
  want: Facing,
  facing: Facing,
  stream: MediaStream,
  open: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): Promise<FlipResult> {
  if (facing === want) {
    rememberFacing(want);
    return { facing: want, stream, ok: true };
  }
  try {
    const opened = await open(cameraConstraints(want));
    for (const track of stream.getTracks()) track.stop();
    rememberFacing(want);
    return { facing: want, stream: opened, ok: true };
  } catch {
    return { facing, stream, ok: false };
  }
}
