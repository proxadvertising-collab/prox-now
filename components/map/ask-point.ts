import { DEMO_CENTER } from "@/lib/fixtures/shops";
import type { LatLng } from "@/lib/geo";

/** Demo and fixture maps ask from the pilot street. A real visit uses the fix. */
export function mapAskPoint(input: {
  fixtures: boolean;
  demoSession: boolean;
  userPoint: LatLng | null;
  origin: LatLng | null;
}): LatLng | null {
  return input.fixtures || input.demoSession ? DEMO_CENTER : input.userPoint ?? input.origin;
}
