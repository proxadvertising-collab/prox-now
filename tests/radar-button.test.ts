import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarButton } from "../components/ui/RadarButton";

describe("radar button", () => {
  it("renders the orange radar and its label", () => {
    const html = renderToStaticMarkup(createElement(RadarButton, { label: "Take a photo" }));
    expect(html).toContain('aria-label="Take a photo"');
    expect(html).toContain('type="button"');
    expect(html).toContain('viewBox="-91 -91 182 182"');
    expect(html).toContain('r="78"');
    expect(html).toContain('r="56"');
    expect(html).toContain('r="34"');
    expect(html).toContain("M0-91v18 M91 0H73 M0 91V73 M-91 0h18");
    expect(html).toContain("M0 0L0-78A78 78 0 0 0-55.2-55.2Z");
    expect(html).toContain("M0 0V-78");
    expect(html).toContain("#ff7a35");
    expect(html).toContain('class="sw"');
    expect(html).toContain('class="bl"');
    expect(html).toContain('stdDeviation="8"');
    expect(html).toContain("@keyframes sw{to{transform:rotate(360deg)}}");
    expect(html).toContain("@media (prefers-reduced-motion:reduce){.sw,.bl{animation:none}}");
  });

  it("fires the camera action on tap", () => {
    let taps = 0;
    const element = createElement(RadarButton, {
      label: "Take a photo",
      onClick: () => {
        taps += 1;
      },
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('aria-label="Take a photo"');
    element.props.onClick?.();
    expect(taps).toBe(1);
  });
});
