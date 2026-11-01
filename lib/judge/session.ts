export const JUDGE_COOKIE = "prox-judge";

const DEMO_COOKIE = "prox-demo";

/** Client-readable. TourChrome checks this before it will show a judge card. */
export function judgeCookie(role: "explorer" | "owner"): string {
  return JUDGE_COOKIE + "=" + role + "; Path=/; SameSite=Lax";
}

/** Expire the judge tour and the demo-zone cookie. */
export function clearJudgeCookies(): string[] {
  return [
    JUDGE_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax",
    DEMO_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax",
  ];
}

export function hasJudgeCookie(cookieString: string): boolean {
  return cookieString.split(";").some((part) => {
    const [name, value] = part.trim().split("=");
    return name === JUDGE_COOKIE && (value === "explorer" || value === "owner");
  });
}

/** A stored tour is judge mode only while the judge cookie is present too. */
export function tourAllowed(input: { judgeCookie: boolean; tour: unknown }): boolean {
  if (!input.judgeCookie || input.tour == null) return false;
  if (typeof input.tour === "string" && input.tour.length === 0) return false;
  return true;
}
