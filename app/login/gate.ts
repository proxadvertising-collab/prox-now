import { safeNext } from "../../lib/auth/safe-next";

/** Signed out opens the login screen. Signed in opens the map. */
export function openingDest(signedIn: boolean): "/map" | "/login" {
  return signedIn ? "/map" : "/login";
}

/**
 * A keep-off choice stores prox-keep=0. Leftover auth cookies from that tab
 * must not count as signed in, or a closed tab would skip login.
 */
export function serverSignedIn(hasUser: boolean, keepCookie: string | undefined): boolean {
  if (keepCookie === "0") return false;
  return hasUser;
}

/** Where a signed-in person goes. Never back to /login. */
export function signedInDest(next: string | null | undefined): string {
  const dest = safeNext(next, "/map");
  const path = dest.split("?")[0]?.split("#")[0] ?? dest;
  if (path === "/login") return "/map";
  return dest;
}

export function loginDest(signedIn: boolean, next: string | null | undefined): string | null {
  if (!signedIn) return null;
  return signedInDest(next);
}
