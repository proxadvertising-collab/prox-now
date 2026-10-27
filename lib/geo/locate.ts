export type LocatePoint = { lat: number; lng: number };

export type LocateFailure = "denied" | "unavailable" | "timeout" | "insecure" | "no_api";

export type LocateResult = { status: "ok"; point: LocatePoint } | { status: LocateFailure };

export type LocateNavigator = {
  geolocation?: {
    getCurrentPosition: (
      success: (position: { coords: { latitude: number; longitude: number } }) => void,
      error?: (error: { code?: number }) => void,
      options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
    ) => void;
  };
  permissions?: {
    query: (descriptor: { name: string }) => Promise<{ state: string }>;
  };
};

export type LocateEnv = {
  nav?: LocateNavigator | null;
  secure?: boolean;
  timeoutMs?: number;
};

const IN_APP = /FBAN|FBAV|Instagram|Line|MicroMessenger/i;

export function isInAppUserAgent(userAgent: string): boolean {
  return IN_APP.test(userAgent);
}

export function isWebViewUserAgent(userAgent: string): boolean {
  if (/; wv\)/i.test(userAgent) || /WebView/i.test(userAgent)) return true;
  return /iPhone|iPad|iPod/i.test(userAgent) && !/Safari/i.test(userAgent);
}

/** Named in-app browsers, or a webview whose geolocation call cannot work. */
export function needsExternalBrowser(userAgent: string, status: LocateResult["status"] | null): boolean {
  if (isInAppUserAgent(userAgent)) return true;
  if (!isWebViewUserAgent(userAgent)) return false;
  return status === "no_api" || status === "insecure" || status === "unavailable";
}

function defaultNav(): LocateNavigator | null {
  if (typeof navigator === "undefined") return null;
  return navigator as LocateNavigator;
}

function defaultSecure(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext !== false;
}

function fromError(code: number | undefined, permission: string | null): LocateFailure {
  if (permission === "denied") return "denied";
  if (code === 1) return permission === "granted" ? "unavailable" : "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

export async function locate(env: LocateEnv = {}): Promise<LocateResult> {
  const nav = env.nav === undefined ? defaultNav() : env.nav;
  const secure = env.secure ?? defaultSecure();
  if (!nav?.geolocation) return { status: "no_api" };
  if (!secure) return { status: "insecure" };

  let permission: string | null = null;
  if (nav.permissions?.query) {
    try {
      const result = await nav.permissions.query({ name: "geolocation" });
      permission = result.state;
    } catch {
      permission = null;
    }
  }
  if (permission === "denied") return { status: "denied" };

  const timeoutMs = env.timeoutMs ?? 10_000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: LocateResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    try {
      nav.geolocation!.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            finish({ status: "unavailable" });
            return;
          }
          finish({ status: "ok", point: { lat, lng } });
        },
        (error) => finish({ status: fromError(error?.code, permission) }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
      );
    } catch {
      finish({ status: "unavailable" });
    }
  });
}
