import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
