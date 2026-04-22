import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    timeout: 30_000,
  },
  resolve: {
    alias: {
      "@sandaluci/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@sandaluci/wiki": path.resolve(__dirname, "packages/wiki/src/index.ts"),
      "@sandaluci/kaizen": path.resolve(__dirname, "packages/kaizen/src/index.ts"),
    },
  },
});
