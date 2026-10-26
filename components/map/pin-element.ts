import type { DemoPost } from "@/lib/fixtures/demo-posts";
import type { FixtureShop } from "@/lib/fixtures/shops";
import { formatRemaining, phaseFor, remainingMs } from "@/lib/freshness";

const SVG_NS = "http://www.w3.org/2000/svg";

const GLYPH: Record<string, string> = {
  food: "M8 3v8a4 4 0 0 0 8 0V3M12 15v6",
  drink: "M7 4h10l-1.2 7.2a4 4 0 0 1-7.6 0L7 4zM12 15.2V20",
  service: "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z",
  stay: "M4 11l8-7 8 7v8H4z",
  barber: "M7 4l10 16M17 4L7 20",
};

function appendSvg(parent: HTMLElement, pathD: string, size: number): void {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  parent.append(svg);
}

export function createPinElement(post: DemoPost, shop: FixtureShop, nowMs: number): HTMLElement {
  const remaining = remainingMs(post.expires_at, nowMs);
  const phase = phaseFor(remaining);
  const time = formatRemaining(remaining);

  const root = document.createElement("div");
  root.className = "prox-pin";
  root.dataset.phase = phase;
  root.dataset.shopId = shop.id;
  root.setAttribute("role", "button");
  root.tabIndex = 0;
  root.setAttribute("aria-label", shop.name + " – " + time + " left");

  const body = document.createElement("div");
  body.className = "prox-pin__body";
  body.setAttribute("aria-hidden", "true");

  const dot = document.createElement("span");
  dot.className = "prox-pin__dot";
  appendSvg(dot, GLYPH[shop.category] ?? GLYPH.food, 16);

  const chip = document.createElement("span");
  chip.className = "prox-pin__chip";
  if (phase === "last") {
    appendSvg(chip, "M12 8v5l3 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16", 12);
  }
  const chipText = document.createElement("span");
  chipText.textContent = time;
  chip.append(chipText);

  const local = document.createElement("span");
  local.className = "prox-pin__local";
  local.textContent = shop.nameLocal ?? shop.name;
  local.hidden = true;

  body.append(dot, chip, local);
  root.append(body);

  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      root.click();
    }
  });

  return root;
}
