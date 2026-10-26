import { describe, expect, it } from "vitest";
import {
  TOTAL_MS,
  formatRemaining,
  phaseFor,
  remainingMs,
  ringOffset,
} from "./freshness";

const MINUTE = 60_000;

describe("phaseFor", () => {
  it("treats 60:00 as aging and anything above it as fresh", () => {
    expect(phaseFor(60 * MINUTE + 1)).toBe("fresh");
    expect(phaseFor(60 * MINUTE)).toBe("aging");
    expect(phaseFor(TOTAL_MS)).toBe("fresh");
  });

  it("treats 10:00 as aging and anything under it as last", () => {
    expect(phaseFor(10 * MINUTE)).toBe("aging");
    expect(phaseFor(10 * MINUTE - 1)).toBe("last");
    expect(phaseFor(1)).toBe("last");
  });

  it("expires at zero and below", () => {
    expect(phaseFor(0)).toBe("expired");
    expect(phaseFor(-1)).toBe("expired");
  });
});

describe("formatRemaining", () => {
  it("formats hours, minutes, sub-10 minutes, and zero", () => {
    expect(formatRemaining(4_320_000)).toBe("1h 12m");
    expect(formatRemaining(3_600_000)).toBe("1h 0m");
    expect(formatRemaining(38 * MINUTE)).toBe("38m");
    expect(formatRemaining(10 * MINUTE)).toBe("10m");
    expect(formatRemaining(9 * MINUTE + 41_000)).toBe("9m 41s");
    expect(formatRemaining(599_000)).toBe("9m 59s");
    expect(formatRemaining(0)).toBe("0s");
    expect(formatRemaining(-5)).toBe("0s");
  });
});

describe("ringOffset", () => {
  it("is empty at full time, half at halfway, and full at zero", () => {
    expect(ringOffset(200, TOTAL_MS)).toBe(0);
    expect(ringOffset(200, TOTAL_MS / 2)).toBe(100);
    expect(ringOffset(200, 0)).toBe(200);
  });

  it("clamps remaining time above the total and below zero", () => {
    expect(ringOffset(200, TOTAL_MS + 50)).toBe(0);
    expect(ringOffset(200, -10)).toBe(200);
    expect(ringOffset(10, 5, 10)).toBe(5);
  });
});

describe("remainingMs", () => {
  it("subtracts now from the expiry instant", () => {
    const now = Date.parse("2026-10-26T01:00:00.000Z");
    expect(remainingMs("2026-10-26T03:00:00.000Z", now)).toBe(TOTAL_MS);
  });
});
