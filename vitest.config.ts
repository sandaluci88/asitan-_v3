import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/groq.test.ts",
      "tests/llm_parse_test.ts",
      "tests/timezone_check.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/index.ts"],
    },
    testTimeout: 10000,
  },
});
