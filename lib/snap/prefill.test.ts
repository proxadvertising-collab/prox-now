import { describe, expect, it } from "vitest";
import { prefillShop } from "./prefill";

describe("prefillShop", () => {
  it("uses a Thai sign and its English translation", () => {
    expect(
      prefillShop({
        signText: [{ original: "ครัวแม่เย็น", translated: "Krua Mae Yen" }],
        category: "restaurant",
      }),
    ).toEqual({
      name: "Krua Mae Yen",
      nameLocal: "ครัวแม่เย็น",
      category: "restaurant",
    });
  });

  it("keeps mixed Thai and English on the local name", () => {
    expect(
      prefillShop({
        signText: [{ original: "Mala หม่าล่า", translated: "Mala" }],
        category: "street_food",
      }),
    ).toEqual({
      name: "Mala",
      nameLocal: "Mala หม่าล่า",
      category: "street_food",
    });
  });

  it("returns an empty name for empty input", () => {
    expect(prefillShop({})).toEqual({ name: "", nameLocal: null, category: "other" });
  });

  it("uses an English sign with no local name", () => {
    expect(
      prefillShop({
        signText: [{ original: "Mala Mafia", translated: "Mala Mafia" }],
        category: "food",
      }),
    ).toEqual({
      name: "Mala Mafia",
      nameLocal: null,
      category: "street_food",
    });
  });

  it("skips a price and uses the next line", () => {
    expect(
      prefillShop({
        signText: [
          { original: "50 บาท", translated: "50 baht" },
          { original: "ปากกะปิ", translated: "Pak Kapi" },
        ],
      }).name,
    ).toBe("Pak Kapi");
  });

  it("skips a phone number", () => {
    const result = prefillShop({
      signText: [
        { original: "081-234-5678", translated: "081-234-5678" },
        { original: "BEEGEE Barber", translated: "BEEGEE Barber" },
      ],
      category: "barber",
    });
    expect(result.name).toBe("BEEGEE Barber");
    expect(result.nameLocal).toBeNull();
    expect(result.category).toBe("barber");
  });

  it("maps drinks", () => {
    expect(
      prefillShop({
        signText: [{ original: "Coconut shake", translated: "Coconut shake" }],
        category: "drinks",
      }).category,
    ).toBe("drinks");
  });

  it("maps an unknown category to other", () => {
    expect(
      prefillShop({
        signText: [{ original: "Shop", translated: "Shop" }],
        category: "not-a-category",
      }).category,
    ).toBe("other");
  });

  it("maps Street Food with a space", () => {
    expect(prefillShop({ category: "Street Food" }).category).toBe("street_food");
  });

  it("keeps a Chinese sign as the local name", () => {
    expect(
      prefillShop({
        signText: [{ original: "面馆", translated: "Noodle shop" }],
      }),
    ).toMatchObject({ name: "Noodle shop", nameLocal: "面馆", category: "other" });
  });
});
