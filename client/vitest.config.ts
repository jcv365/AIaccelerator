import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    exclude: ["**/*.js", "**/*.js.map"],
    setupFiles: ["./vitest.setup.ts"],
  },
});