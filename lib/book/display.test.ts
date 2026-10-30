import { describe, expect, it } from "vitest";
import { bookText, displayName, parseHours } from "./display";

describe("display names", () => {
  it("turns ALL-CAPS English into Title Case and leaves Thai and mixed case alone", () => {
    expect(displayName("MALA BEEF")).toBe("Mala Beef");
    expect(displayName("TOM-YUM")).toBe("Tom-Yum");
    expect(displayName("หม่าล่า")).toBe("หม่าล่า");
    expect(displayName("Mala Beef")).toBe("Mala Beef");
    expect(displayName("ชา Beef")).toBe("ชา Beef");
  });
});

describe("hours rows", () => {
  it("parses day groups and common time spellings", () => {
    expect(parseHours("Sat:09.00 - 19.30")).toEqual([{ days: "Sat", time: "09:00–19:30" }]);
    expect(parseHours("09.00-19.30")).toEqual([{ days: "", time: "09:00–19:30" }]);
    expect(parseHours("9am-7pm")).toEqual([{ days: "", time: "09:00–19:00" }]);
    expect(parseHours("Mon:09:00-19:30, Tue:09:00-19:30, Wed:09:00-19:30, Thu:09:00-19:30, Fri:09:00-19:30")).toEqual([
      { days: "Mon–Fri", time: "09:00–19:30" },
    ]);
    expect(parseHours("Mon–Fri  09:00–19:30")).toEqual([{ days: "Mon–Fri", time: "09:00–19:30" }]);
  });

  it("returns null when the string cannot be parsed", () => {
    expect(parseHours("ask the shop")).toBeNull();
    expect(parseHours("")).toBeNull();
  });
});

describe("book text", () => {
  it("drops raw GPS coordinates and capture timestamps", () => {
    expect(bookText("12.5684, 99.9577")).toBeNull();
    expect(bookText("2026-10-29T13:30:00.000Z")).toBeNull();
    expect(bookText("Soi 102")).toBe("Soi 102");
  });
});
