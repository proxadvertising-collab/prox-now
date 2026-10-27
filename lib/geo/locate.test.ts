import { describe, expect, it, vi } from "vitest";
import {
  isInAppUserAgent,
  isWebViewUserAgent,
  locate,
  needsExternalBrowser,
  type LocateNavigator,
} from "./locate";

function nav(partial: LocateNavigator): LocateNavigator {
  return partial;
}

describe("locate", () => {
  it("returns no_api when geolocation is missing", async () => {
    await expect(locate({ nav: nav({}), secure: true })).resolves.toEqual({ status: "no_api" });
  });

  it("returns insecure and does not ask for a position", async () => {
    const getCurrentPosition = vi.fn();
    const result = await locate({
      nav: nav({ geolocation: { getCurrentPosition } }),
      secure: false,
    });
    expect(result).toEqual({ status: "insecure" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("returns the point when the browser allows location", async () => {
    const result = await locate({
      nav: nav({
        geolocation: {
          getCurrentPosition: (success) => {
            success({ coords: { latitude: 12.5, longitude: 99.9 } });
          },
        },
      }),
      secure: true,
    });
    expect(result).toEqual({ status: "ok", point: { lat: 12.5, lng: 99.9 } });
  });

  it("uses the Permissions API to tell denied from unavailable", async () => {
    const deniedSpy = vi.fn();
    const denied = await locate({
      nav: nav({
        permissions: { query: async () => ({ state: "denied" }) },
        geolocation: { getCurrentPosition: deniedSpy },
      }),
      secure: true,
    });
    expect(denied).toEqual({ status: "denied" });
    expect(deniedSpy).not.toHaveBeenCalled();

    const unavailable = await locate({
      nav: nav({
        permissions: { query: async () => ({ state: "granted" }) },
        geolocation: {
          getCurrentPosition: (_success, error) => error?.({ code: 2 }),
        },
      }),
      secure: true,
    });
    expect(unavailable).toEqual({ status: "unavailable" });

    const grantedButCodeDenied = await locate({
      nav: nav({
        permissions: { query: async () => ({ state: "granted" }) },
        geolocation: {
          getCurrentPosition: (_success, error) => error?.({ code: 1 }),
        },
      }),
      secure: true,
    });
    expect(grantedButCodeDenied).toEqual({ status: "unavailable" });

    const promptDenied = await locate({
      nav: nav({
        permissions: { query: async () => ({ state: "prompt" }) },
        geolocation: {
          getCurrentPosition: (_success, error) => error?.({ code: 1 }),
        },
      }),
      secure: true,
    });
    expect(promptDenied).toEqual({ status: "denied" });
  });

  it("returns timeout when the browser never answers", async () => {
    const result = await locate({
      nav: nav({
        geolocation: { getCurrentPosition: () => undefined },
      }),
      secure: true,
      timeoutMs: 20,
    });
    expect(result).toEqual({ status: "timeout" });
  });

  it("flags in-app browsers and webviews with no working geolocation", () => {
    expect(isInAppUserAgent("Mozilla FBAN/1")).toBe(true);
    expect(isInAppUserAgent("FBAV/2")).toBe(true);
    expect(isInAppUserAgent("Instagram 10")).toBe(true);
    expect(isInAppUserAgent("Line/12")).toBe(true);
    expect(isInAppUserAgent("MicroMessenger")).toBe(true);
    expect(isInAppUserAgent("Mozilla Chrome Safari")).toBe(false);

    expect(isWebViewUserAgent("Linux; Android 14; wv) AppleWebKit")).toBe(true);
    expect(isWebViewUserAgent("iPhone CPU iPhone OS 17 like Mac OS X")).toBe(true);
    expect(isWebViewUserAgent("iPhone AppleWebKit Safari")).toBe(false);

    expect(needsExternalBrowser("Instagram", null)).toBe(true);
    expect(needsExternalBrowser("Linux; wv) Chrome", "no_api")).toBe(true);
    expect(needsExternalBrowser("Linux; wv) Chrome", "unavailable")).toBe(true);
    expect(needsExternalBrowser("Linux; wv) Chrome", "ok")).toBe(false);
    expect(needsExternalBrowser("Mozilla Chrome Safari", "unavailable")).toBe(false);
  });
});
