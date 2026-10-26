import { DEMO_CENTER } from "@/lib/fixtures/shops";
import type { LatLng } from "@/lib/geo";

let origin: LatLng = DEMO_CENTER;
const listeners = new Set<() => void>();

export function subscribeWalkOrigin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWalkOrigin(): LatLng {
  return origin;
}

export function getServerWalkOrigin(): LatLng {
  return DEMO_CENTER;
}

export function setWalkOrigin(next: LatLng): void {
  origin = next;
  for (const listener of listeners) listener();
}
