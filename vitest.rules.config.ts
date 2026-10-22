import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: [
      "tests/rules/**/*.test.ts",
      "functions/test/envioPublico.test.ts",
    ],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
