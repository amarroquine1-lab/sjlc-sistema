import { defineConfig } from "vitest/config";

// Dos grupos: unitarias (sin base de datos) e integración (base desechable, ver scripts/probar-backend.sh).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unitarias", include: ["tests/unitarias/**/*.test.ts"], environment: "node" } },
      {
        test: {
          name: "integracion", include: ["tests/integracion/**/*.test.ts"], environment: "node",
          testTimeout: 30000, hookTimeout: 30000, fileParallelism: false,
        },
      },
    ],
  },
});
