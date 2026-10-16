import { defineConfig } from "@playwright/test";

// Capturas de todas las pantallas (antes y después del rediseño). Uso: scripts/capturar-pantallas.sh antes|despues
export default defineConfig({
  testDir: "./capturas",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 420000,
  outputDir: "/tmp/e2e-resultados/salida-capturas",
  reporter: [["list"]],
  use: { actionTimeout: 15000, baseURL: process.env.URL_BASE ?? "http://localhost:18080", locale: "es-GT", timezoneId: "America/Guatemala" },
  projects: [
    { name: "escritorio", use: { viewport: { width: 1366, height: 768 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "movil", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
