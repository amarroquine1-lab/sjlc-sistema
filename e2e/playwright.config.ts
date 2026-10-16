import { defineConfig } from "@playwright/test";

// Pruebas de punta a punta contra el sistema completo (Nginx + backend + BD de pruebas).
// Dos pantallas: escritorio 1366×768 y tablet.
export default defineConfig({
  testDir: "./pruebas",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: "/tmp/e2e-resultados/salida",
  reporter: [["list"]],
  use: {
    baseURL: process.env.URL_BASE ?? "http://localhost:18080",
    locale: "es-GT",
    timezoneId: "America/Guatemala",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { viewport: { width: 1366, height: 768 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
});
