import { defineConfig } from "@playwright/test";

// Capturas para los manuales y la tesis: escritorio 1366x768 contra el entorno de desarrollo con datos ficticios.
export default defineConfig({
  testDir: "./capturas",
  testMatch: "manual.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 420000,
  outputDir: "/tmp/e2e-resultados/salida-manual",
  reporter: [["list"]],
  use: { actionTimeout: 15000, baseURL: process.env.URL_BASE ?? "http://localhost:8080", locale: "es-GT", timezoneId: "America/Guatemala", viewport: { width: 1366, height: 768 } },
});
