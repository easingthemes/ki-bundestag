import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/engine/src/**/*.test.ts", "packages/api/src/**/*.test.ts"],
  },
});
