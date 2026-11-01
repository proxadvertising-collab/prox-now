import type { LatLng } from "@/lib/geo";

let origin: LatLng | null = null;
const listeners = new Set<() => void>();

export function subscribeWalkOrigin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWalkOrigin(): LatLng | null {
  return origin;
}

export function getServerWalkOrigin(): LatLng | null {
  return null;
}

export function setWalkOrigin(next: LatLng): void {
  origin = next;
  for (const listener of listeners) listener();
}
