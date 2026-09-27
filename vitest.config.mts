import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: {
    "@": path.resolve(import.meta.dirname, "src"),
    "server-only": path.resolve(import.meta.dirname, "src/test/server-only.ts"),
  } },
  test: { environment: "jsdom", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"] },
});
