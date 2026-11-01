export function cameraStart(perm: "granted" | "prompt" | "denied" | null): "auto" | "tap" | "closed" {
  if (perm === "granted") return "auto";
  if (perm === "denied") return "closed";
  return "tap";
}
