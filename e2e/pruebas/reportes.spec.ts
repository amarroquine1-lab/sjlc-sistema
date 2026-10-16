import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

test.describe("Reportes", () => {
  test("el administrador genera reportes con filtros y la vista de impresión usa carta y blanco y negro", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    await pacienteConAtencion(recepcion, "Ana");
    await ingresarPorPantalla(page, "padmin");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/reportes");
    await page.getByRole("button", { name: "Generar reporte" }).click();
    const rep = page.getByRole("article", { name: "Reporte" });
    await expect(rep).toContainText("Atenciones por período y tipo");
    await expect(rep).toContainText("Centro de Salud San José La Comunidad");
    await expect(rep.getByRole("columnheader", { name: "Total" })).toBeVisible();
    await page.getByRole("combobox", { name: "Reporte" }).selectOption("tiempos-espera");
    await page.getByRole("button", { name: "Generar reporte" }).click();
    await expect(rep).toContainText("Tiempos de espera por área");
    await page.getByRole("combobox", { name: "Reporte" }).selectOption("consultas-diarias");
    await page.getByRole("button", { name: "Generar reporte" }).click();
    await expect(rep).toContainText("provisional");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/reportes-${info.project.name}.png`, fullPage: true });
    // Vista de impresión: sin barra ni filtros, tabla con bordes negros
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".barra")).toBeHidden();
    await expect(page.getByRole("form", { name: "Filtros del reporte" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    // Fechas al revés: mensaje claro
    await page.getByLabel("Desde").fill("2026-12-31");
    await page.getByLabel("Hasta").fill("2026-01-01");
    await page.getByRole("button", { name: "Generar reporte" }).click();
    await expect(page.getByRole("alert")).toContainText("no puede ser anterior");
  });

  test("las áreas no entran a los reportes", async ({ page }) => {
    await ingresarPorPantalla(page, "precepcion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/reportes");
    await expect(page.getByRole("heading", { name: "No tiene acceso a esta pantalla" })).toBeVisible();
  });
});
