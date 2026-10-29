import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

const { getUser, demoLimit } = vi.hoisted(() => ({
  getUser: vi.fn(),
  demoLimit: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ limit: demoLimit }) }),
  }),
}));

import { GET as metaPing } from "./route";

function metaOk() {
  return {
    ok: true,
    json: async () => ({
      model: "muse-spark-1.3",
      output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
    }),
  };
}

describe("GET /api/meta-ping lock", () => {
  beforeEach(() => {
    getUser.mockReset();
    demoLimit.mockReset();
    vi.stubEnv("META_API_KEY", "test-meta-key");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal("fetch", vi.fn(async () => metaOk()));
  });

  it("returns 404 for a signed-out caller and an explorer", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const signedOut = await metaPing();
    expect(signedOut.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();

    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    demoLimit.mockResolvedValue({ data: [{ role: "explorer" }], error: null });
    const explorer = await metaPing();
    expect(explorer.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls Meta for the demo owner and in development", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    demoLimit.mockResolvedValue({ data: [{ role: "owner" }], error: null });
    const owner = await metaPing();
    expect(owner.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.stubEnv("NODE_ENV", "development");
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const dev = await metaPing();
    expect(dev.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
