import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FRESH_DEMO_NEXT, resetRemoves } from "./reset";

const explorer = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const captain = "33333333-3333-4333-8333-333333333333";
const demoIds = [explorer, owner];

describe("fresh demo reset", () => {
  it("removes demo-account rows at demo shops and leaves real rows", () => {
    expect(resetRemoves({ actorId: explorer, shopDemo: true }, demoIds)).toBe(true);
    expect(resetRemoves({ actorId: owner, shopDemo: true }, demoIds)).toBe(true);
    expect(resetRemoves({ actorId: captain, shopDemo: true }, demoIds)).toBe(false);
    expect(resetRemoves({ actorId: explorer, shopDemo: false }, demoIds)).toBe(false);
    expect(resetRemoves({ actorId: "real-shopper", shopDemo: true }, demoIds)).toBe(false);
  });

  it("offers a fresh start on the judge page and then opens the camera", () => {
    expect(FRESH_DEMO_NEXT).toBe("/snap");
    const form = readFileSync(resolve(process.cwd(), "app/judge/enter-form.tsx"), "utf8");
    expect(form).toContain("judge.freshOffer");
    expect(form).toContain("judge.freshStart");
    expect(form).toContain('post("/api/judge/reset")');
    expect(form).toContain("judge.fresh");
    expect(form).toContain("FRESH_DEMO_NEXT");
    expect(form.indexOf("judge.freshStart")).toBeLessThan(form.indexOf("judge.shopper"));
    expect(form).toContain("/api/judge/enter?role=explorer");
    expect(form).toContain("/api/judge/enter?role=owner");
  });
});
