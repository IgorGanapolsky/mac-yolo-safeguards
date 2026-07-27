import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/security.ts", "lib/entitlements.ts", "lib/device-auth.ts", "lib/workos-session.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
      reporter: ["text", "json-summary"],
    },
  },
});
