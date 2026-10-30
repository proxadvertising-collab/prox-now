import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { translateNote } = vi.hoisted(() => ({ translateNote: vi.fn() }));

vi.mock("../../../../lib/order/translate", () => ({
  translateNote,
  allowOrderTranslate: () => true,
}));

vi.mock("../../../../lib/rate/window", () => ({
  clientIp: () => "203.0.113.8",
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/order/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/order/translate", () => {
  beforeEach(() => {
    translateNote.mockReset();
  });

  it("returns 400 for an empty note", async () => {
    const response = await call({ text: "   ", to: "th" });
    expect(response.status).toBe(400);
    expect(translateNote).not.toHaveBeenCalled();
  });

  it("returns 413 over 500 characters", async () => {
    const response = await call({ text: "a".repeat(501), to: "th" });
    expect(response.status).toBe(413);
    expect(translateNote).not.toHaveBeenCalled();
  });

  it("returns the mocked translation", async () => {
    translateNote.mockResolvedValue("ไม่ใส่มะเขือเทศ");
    const response = await call({ text: "no tomatoes", to: "th" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translation: "ไม่ใส่มะเขือเทศ" });
    expect(translateNote).toHaveBeenCalledWith("no tomatoes", "th");
  });
});
