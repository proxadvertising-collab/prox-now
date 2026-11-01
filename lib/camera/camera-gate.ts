export function cameraStart(perm: "granted" | "prompt" | "denied" | null): "auto" | "tap" | "closed" {
  if (perm === "granted") return "auto";
  if (perm === "denied") return "closed";
  return "tap";
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
