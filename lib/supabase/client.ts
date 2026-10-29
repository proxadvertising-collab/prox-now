import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const KEEP_STORAGE_KEY = "prox-keep-signed-in";
export const KEEP_COOKIE = "prox-keep";
export const SESSION_MIRROR_KEY = "prox-auth-session";

export type SessionPersistence = "local" | "session";

type CookieRow = {
  name: string;
  value: string;
  options?: { path?: string; maxAge?: number; sameSite?: string | boolean; secure?: boolean };
};

/** ON stays in local storage. OFF stays in session storage and ends with the tab. */
export function sessionPersistence(keepSignedIn: boolean): SessionPersistence {
  return keepSignedIn ? "local" : "session";
}

export function pickAuthStorage(
  keepSignedIn: boolean,
  stores: { local: Storage; session: Storage },
): Storage {
  return sessionPersistence(keepSignedIn) === "local" ? stores.local : stores.session;
}

export function shouldClearTabSession(persistence: SessionPersistence, mirror: string | null): boolean {
  return persistence === "session" && !mirror;
}

/** A tab-scoped sign-in skips the form only while its session mirror is still here. */
export function clientSkipsLogin(persistence: SessionPersistence, mirror: string | null): boolean {
  return persistence === "session" && Boolean(mirror);
}

export function readCookiePairs(header: string): { name: string; value: string }[] {
  if (!header) return [];
  const pairs: { name: string; value: string }[] = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    const rawName = index === -1 ? trimmed : trimmed.slice(0, index);
    const rawValue = index === -1 ? "" : trimmed.slice(index + 1);
    try {
      pairs.push({ name: decodeURIComponent(rawName), value: decodeURIComponent(rawValue) });
    } catch {
      pairs.push({ name: rawName, value: rawValue });
    }
  }
  return pairs;
}

export function authCookieNames(header: string): string[] {
  return readCookiePairs(header)
    .map((pair) => pair.name)
    .filter((name) => name.startsWith("sb-"));
}

function browserKeep(explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEEP_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeKeepCookie(keepSignedIn: boolean): void {
  const value = keepSignedIn ? "1" : "0";
  document.cookie = `${KEEP_COOKIE}=${value}; Path=/; Max-Age=34560000; SameSite=Lax`;
  try {
    window.localStorage.setItem(KEEP_STORAGE_KEY, value);
  } catch {
    // Private mode can block storage. The cookie still records the choice.
  }
}

function writeBrowserCookie(name: string, value: string, maxAge: number | undefined, secure: boolean): void {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (maxAge === 0) parts.push("Max-Age=0");
  else if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

function clearAuthCookies(): void {
  for (const name of authCookieNames(document.cookie)) {
    writeBrowserCookie(name, "", 0, false);
  }
}

function sessionCookieMethods() {
  return {
    getAll() {
      return readCookiePairs(document.cookie);
    },
    setAll(cookies: CookieRow[]) {
      let writing = false;
      for (const cookie of cookies) {
        const maxAge = cookie.options?.maxAge;
        const deleting = maxAge === 0 || cookie.value === "";
        if (!deleting) writing = true;
        // No Max-Age: the cookie is a session cookie. The tab mirror is what
        // ends the sign-in when this tab is gone.
        writeBrowserCookie(cookie.name, cookie.value, deleting ? 0 : undefined, cookie.options?.secure === true);
      }
      try {
        if (writing) window.sessionStorage.setItem(SESSION_MIRROR_KEY, "1");
        else window.sessionStorage.removeItem(SESSION_MIRROR_KEY);
      } catch {
        // The session cookie still ends when the browser closes.
      }
    },
  };
}

export function createClient(options?: { keepSignedIn?: boolean }): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase env vars are not set");
  }

  const explicit = options !== undefined && typeof options.keepSignedIn === "boolean";
  const keepSignedIn = browserKeep(explicit ? options?.keepSignedIn : undefined);
  const persistence = sessionPersistence(keepSignedIn);

  if (explicit && typeof window !== "undefined") {
    writeKeepCookie(keepSignedIn);
    if (keepSignedIn) {
      try {
        window.sessionStorage.removeItem(SESSION_MIRROR_KEY);
      } catch {
        // Ignore private mode.
      }
    }
  }

  if (typeof window !== "undefined" && persistence === "session" && !explicit) {
    let mirror: string | null = null;
    try {
      mirror = window.sessionStorage.getItem(SESSION_MIRROR_KEY);
    } catch {
      mirror = null;
    }
    if (shouldClearTabSession(persistence, mirror)) clearAuthCookies();
  }

  const tabScoped = persistence === "session" && typeof window !== "undefined";
  return createBrowserClient(url, anonKey, {
    ...(explicit ? { isSingleton: false } : {}),
    ...(tabScoped ? { cookies: sessionCookieMethods() } : {}),
  });
}
