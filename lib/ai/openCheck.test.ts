import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_CHECK_MAX_TOKENS,
  OPEN_CHECK_MODEL,
  OPEN_CHECK_TIMEOUT_MS,
  OPEN_CHECK_URL,
  applyMenuFlags,
  checkMenuOpen,
} from "./openCheck";

const photo = "data:image/jpeg;base64,aGVsbG8=";
const items = [{ name: "Pad Thai" }, { name: "Mango" }, { name: "Tea" }];

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("muse spark open check", () => {
  it("confirms items and still posts every name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sent = { url: "", body: {} as Record<string, unknown>, authorization: "" };
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      sent.url = String(url);
      sent.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.authorization = new Headers(init?.headers).get("authorization") ?? "";
      const content =
        "The first photo shows pad thai and tea. The mango is not on the board.\n" +
        '{"confirmed":["Pad Thai","Tea"],"unconfirmed":[]}';
      return jsonResponse(content);
    }) as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: "test-key", fetchImpl });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    const flagged = applyMenuFlags(items, result);
    expect(flagged.map((item) => item.name)).toEqual(["Pad Thai", "Mango", "Tea"]);
    expect(flagged.map((item) => item.needsCheck ?? false)).toEqual([false, false, false]);
    expect(sent.url).toBe(OPEN_CHECK_URL);
    expect(sent.body.model).toBe(OPEN_CHECK_MODEL);
    expect(sent.body.max_tokens).toBeGreaterThanOrEqual(2000);
    expect(sent.body.max_tokens).toBe(OPEN_CHECK_MAX_TOKENS);
    expect(sent.authorization).toBe("Bearer test-key");
    expect(warn).not.toHaveBeenCalled();
  });

  it("flags unconfirmed items and does not drop them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = (async () =>
      jsonResponse('{"confirmed":["Pad Thai","Tea"],"unconfirmed":["Mango","Tea"]}')) as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: "test-key", fetchImpl });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    const flagged = applyMenuFlags(
      [{ name: "Pad Thai" }, { name: "mango" }, { name: "Tea" }, { name: "Soup" }],
      result,
    );
    expect(flagged).toHaveLength(4);
    expect(flagged.find((item) => item.name === "Pad Thai")?.needsCheck).toBeUndefined();
    expect(flagged.find((item) => item.name === "mango")?.needsCheck).toBe(true);
    expect(flagged.find((item) => item.name === "Tea")?.needsCheck).toBe(true);
    expect(flagged.find((item) => item.name === "Soup")?.needsCheck).toBeUndefined();
  });

  it("fails open on timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as typeof fetch;
    const result = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl,
      timeoutMs: 20,
    });
    expect(OPEN_CHECK_TIMEOUT_MS).toBe(20_000);
    expect(result).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("timeout");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("test-key");
  });

  it("fails open on bad json and on a non-200", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl: (async () => jsonResponse("I am not sure about this menu.")) as typeof fetch,
    });
    expect(bad).toEqual({ ran: false });
    const http = await checkMenuOpen({
      images: [{ dataUrl: photo }],
      items,
      apiKey: "test-key",
      fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    expect(http).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain("bad json");
    expect(String(warn.mock.calls[1]?.[0])).toContain("http 503");
  });

  it("fails open when the key is missing and does not call fetch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn() as typeof fetch;
    const result = await checkMenuOpen({ images: [{ dataUrl: photo }], items, apiKey: null, fetchImpl });
    expect(result).toEqual({ ran: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("no key");
    const empty = await checkMenuOpen({ images: [{ dataUrl: photo }], items: [] });
    expect(empty).toEqual({ ran: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
