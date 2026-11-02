import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TOUR_KEY } from "@/lib/judge/script";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/snap",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href?: string; children?: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { LiveCamera } from "./LiveCamera";

function pageWindow(tour: string | null) {
  const store = new Map<string, string>();
  if (tour) store.set(TOUR_KEY, tour);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    location: { search: "", pathname: "/snap", href: "http://localhost/snap" },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  });
  vi.stubGlobal("navigator", { language: "en-US" });
}

describe("snap tour offset", () => {
  it("offsets the camera header and sample control in tour mode on /snap", () => {
    pageWindow(JSON.stringify({ cafe: "a", role: "shopper", step: "seed" }));
    const html = renderToStaticMarkup(createElement(LiveCamera));
    expect(html).toContain("snap-tour");
    expect(html).toContain("calc(1rem + var(--tour-bar, 0px))");
    expect(html).not.toContain("judge can use the sample set");
    const shutter = html.slice(html.indexOf("snap-shutter"));
    expect(shutter.startsWith("snap-shutter")).toBe(true);
    expect(shutter).toContain("Upload photos instead");
    expect(shutter).toContain("Take a photo");
    expect(shutter).not.toContain("tour-bar");
    const source = readFileSync(new URL("./LiveCamera.tsx", import.meta.url), "utf8");
    const frame = source.slice(source.indexOf("fixed inset-x-0"), source.indexOf("Use pre-seeded photos"));
    expect(frame).toContain("snap-tour");
    expect(source).toContain('style={{ top: "calc(7.5rem + var(--tour-bar, 0px))" }}');
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain(".snap-tour .seed-done");
    expect(css).toContain("top: calc(1rem + var(--tour-bar, 0px))");
    const chrome = readFileSync(new URL("../judge/TourChrome.tsx", import.meta.url), "utf8");
    expect(chrome).toContain("relative z-[60]");
    expect(chrome).toContain('setProperty("--tour-bar"');
    expect(chrome).toContain("getBoundingClientRect");
    expect(chrome).not.toContain("pointer-events-none");
    vi.unstubAllGlobals();
  });

  it("leaves the camera header at the top outside tour mode", () => {
    pageWindow(null);
    const html = renderToStaticMarkup(createElement(LiveCamera));
    expect(html).not.toContain("snap-tour");
    expect(html).not.toContain("var(--tour-bar");
    expect(html).not.toContain("judge can use the sample set");
    expect(html).toContain("Upload photos instead");
    vi.unstubAllGlobals();
  });
});
