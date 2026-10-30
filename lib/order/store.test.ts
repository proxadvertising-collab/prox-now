import { describe, expect, it } from "vitest";
import { translateRequestBody } from "./translate";
import {
  addLine,
  clearOrder,
  emptyOrder,
  formatPrice,
  itemCopy,
  orderBarCaption,
  orderBarFor,
  orderBarLabel,
  orderKey,
  orderSummary,
  readOrder,
  removeLine,
  setLineQty,
  setOrderNote,
  staffNoteTarget,
  writeOrder,
  type OrderStorage,
} from "./store";

function memory(): OrderStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const tea = { id: "tea", name: "ชา", nameEn: "Tea", price: "40", photo: null, tags: [] as string[] };
const soup = { id: "soup", name: "ซุป", nameEn: null, price: null, photo: null, tags: [] as string[] };

describe("formatPrice", () => {
  it("strips baht suffixes and shows a baht sign", () => {
    expect(formatPrice("10.-")).toBe("฿10");
    expect(formatPrice("40")).toBe("฿40");
    expect(formatPrice("40.00")).toBe("฿40");
    expect(formatPrice("฿ 65")).toBe("฿65");
    expect(formatPrice("65 baht")).toBe("฿65");
    expect(formatPrice("65 THB")).toBe("฿65");
    expect(formatPrice(180)).toBe("฿180");
    expect(formatPrice("ask")).toBeNull();
  });

  it("keeps two decimals for satang amounts", () => {
    expect(formatPrice(17.95 * 2)).toBe("฿35.90");
    expect(formatPrice("12.5")).toBe("฿12.50");
    expect(formatPrice("฿18.95")).toBe("฿18.95");
    expect(formatPrice(54.85)).toBe("฿54.85");
  });
});

describe("item language", () => {
  it("uses the English name for en and the original name otherwise", () => {
    expect(itemCopy({ name: "ชา", nameEn: "Tea" }, "en")).toEqual({ title: "Tea", subtitle: "ชา" });
    expect(itemCopy({ name: "ชา", nameEn: "Tea" }, "en-US")).toEqual({ title: "Tea", subtitle: "ชา" });
    expect(itemCopy({ name: "ชา", nameEn: "Tea" }, "th")).toEqual({ title: "ชา", subtitle: null });
    expect(itemCopy({ name: "Tea", nameEn: "Tea" }, "en")).toEqual({ title: "Tea", subtitle: null });
    expect(itemCopy({ name: "MALA", nameEn: null }, "")).toEqual({ title: "Mala", subtitle: null });
    expect(itemCopy({ name: "ชา", nameEn: null }, "en")).toEqual({ title: "ชา", subtitle: null });
  });
});

describe("order store", () => {
  it("adds, changes quantity, and removes a line", () => {
    let state = addLine(emptyOrder(), tea);
    expect(state.lines[0]?.qty).toBe(1);
    state = addLine(state, tea);
    expect(state.lines[0]?.qty).toBe(2);
    state = setLineQty(state, "tea", 3);
    expect(state.lines[0]?.qty).toBe(3);
    state = setLineQty(state, "tea", 0);
    expect(state.lines).toHaveLength(0);
    state = addLine(emptyOrder(), tea);
    state = removeLine(state, "tea");
    expect(state.lines).toHaveLength(0);
    state = setOrderNote(addLine(emptyOrder(), tea), "no ice");
    expect(state.note).toBe("no ice");
    expect(clearOrder()).toEqual(emptyOrder());
  });

  it("keeps each shop in its own local order", () => {
    const box = memory();
    writeOrder("mala", addLine(emptyOrder(), tea), box);
    writeOrder("cafe", addLine(emptyOrder(), soup), box);
    expect(orderKey("mala")).toBe("prox-order:mala");
    expect(readOrder("mala", box).lines.map((line) => line.name)).toEqual(["ชา"]);
    expect(readOrder("cafe", box).lines.map((line) => line.name)).toEqual(["ซุป"]);
    expect(readOrder("other", box).lines).toHaveLength(0);
    expect(box.getItem("prox-order:active")).toBeNull();
    expect(orderBarFor("/book/cafe", box, "en")?.slug).toBe("cafe");
    expect(orderBarFor("/book/mala", box, "en")?.slug).toBe("mala");
    expect(orderBarFor("/book/other", box, "en")).toBeNull();
    expect(orderBarFor("/book/mala/order", box, "en")).toBeNull();
  });

  it("totals priced lines and counts lines with no price", () => {
    let state = addLine(emptyOrder(), { ...tea, qty: 2 });
    state = addLine(state, soup);
    expect(orderSummary(state)).toEqual({ count: 3, amount: 80, unpriced: 1 });
    expect(orderBarLabel("en", orderSummary(state))).toBe("View order · 3 items · ฿80");
    expect(orderBarCaption("en", orderSummary(state))).toBe("Some prices not listed");
    state = removeLine(state, "soup");
    expect(orderSummary(state)).toEqual({ count: 2, amount: 80, unpriced: 0 });
    expect(orderBarLabel("en", { count: 4, amount: 640, unpriced: 0 })).toBe("View order · 4 items · ฿640");
    expect(orderBarLabel("en", { count: 4, amount: 0, unpriced: 4 })).toBe("View order · 4 items");
    expect(orderBarLabel("en", { count: 1, amount: 0, unpriced: 1 })).toBe("View order · 1 item");
    expect(orderBarLabel("en", { count: 1, amount: 40, unpriced: 0 })).toBe("View order · 1 item · ฿40");
    expect(orderBarLabel("en", { count: 2, amount: 0, unpriced: 2 })).toBe("View order · 2 items");
    expect(orderBarLabel("th", { count: 1, amount: 0, unpriced: 0 })).toBe("ดูออเดอร์ · 1 รายการ");
    expect(orderBarCaption("en", { unpriced: 0 })).toBeNull();
  });
});

describe("staff language", () => {
  it("translates an English note to Thai for a Thai shop", () => {
    expect(staffNoteTarget("no tomatoes", "TH")).toBe("th");
    expect(staffNoteTarget("no tomatoes", null)).toBe("th");
    expect(staffNoteTarget("ไม่ใส่มะเขือเทศ", "TH")).toBeNull();
  });
});

describe("translate request", () => {
  it("asks muse for a short plain-text translation", () => {
    const body = translateRequestBody("no tomatoes", "th");
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.reasoning.effort).toBe("low");
    expect(body.max_output_tokens).toBe(1500);
    expect(body.store).toBe(false);
    expect(body.input[0]?.content[0]?.type).toBe("input_text");
    expect(body.input[0]?.content[0]?.text).toContain("Thai");
    expect(body.input[0]?.content[0]?.text).toContain("only the translated text");
    expect(body.input[0]?.content[0]?.text).toContain("no tomatoes");
  });
});
