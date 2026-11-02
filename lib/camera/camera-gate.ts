/** Granted starts the preview. Prompt and unknown browsers ask once on arrival. Denied stays closed. */
export function cameraStart(perm: "granted" | "prompt" | "denied" | null): "auto" | "closed" {
  if (perm === "denied") return "closed";
  return "auto";
}

/** One failed start waits for a tap. It does not ask again by itself. */
export function cameraAskFailed(failed: boolean): "gesture" | "live" {
  return failed ? "gesture" : "live";
}

export function shutterAction(input: {
  streamOpen: boolean;
  cameraClosed: boolean;
  phase: "camera" | "pick" | "seed" | "building";
  reviewing: boolean;
}): "open" | "upload" | "shoot" | "none" {
  if (input.phase === "pick" || input.phase === "building") return "none";
  if (input.cameraClosed) return "upload";
  if (!input.streamOpen) return "open";
  return "shoot";
}
