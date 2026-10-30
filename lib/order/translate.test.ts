import { describe, expect, it } from "vitest";
import { parseItemTranslations, translateItemsBody } from "./translate";

describe("menu title batch translation", () => {
  it("asks for a JSON array in the same order", () => {
    const body = translateItemsBody(["Fried rice", "Iced tea"], "th") as { input: unknown };
    const text = JSON.stringify(body);
    expect(text).toContain("Fried rice");
    expect(text).toContain("Iced tea");
    expect(text).toMatch(/JSON array/i);
  });

  it("reads a fenced or chatty array and rejects a wrong count", () => {
    expect(parseItemTranslations('Here you go:\n```json\n["ข้าวผัด", "ชาเย็น"]\n```', 2)).toEqual(["ข้าวผัด", "ชาเย็น"]);
    expect(parseItemTranslations('["ข้าวผัด"]', 2)).toBeNull();
    expect(parseItemTranslations('["ข้าวผัด", 4]', 2)).toBeNull();
    expect(parseItemTranslations("no array", 1)).toBeNull();
  });
});
