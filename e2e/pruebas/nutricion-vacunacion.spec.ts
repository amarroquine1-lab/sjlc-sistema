import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

async function pasarPorSignos(idTipo: number, destino: string, nombres: string) {
  const admin = await apiAdmin(); await cerrarDia(admin);
  const recepcion = await apiComo("precepcion");
  const p = await pacienteConAtencion(recepcion, nombres, idTipo);
  const signos = await apiComo("psignos", "198.51.100.90");
  const id = (await (await signos.post("/api/cola/signos/llamar-siguiente")).json()).atencion.id_atencion;
  expect((await signos.post(`/api/atenciones/${id}/enviar`, { data: { destino } })).ok()).toBeTruthy();
  return p;
}

test.describe("Vacunación y nutrición", () => {
  test("vacunación directa sin doctor: registrar dosis y finalizar", async ({ page }, info) => {
    const p = await pasarPorSignos(2, "vacunacion", "Rosa");
    await ingresarPorPantalla(page, "pvacunacion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/vacunacion");
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText(p.codigo);
    // Botones en el orden pedido, cada uno con el color del área destino
    await expect(page.locator(".barra-envio .boton")).toHaveText(["Enviar a Doctor", "Enviar a Nutrición", "Enviar a Farmacia", "Finalizar"]);

    await page.getByRole("button", { name: "Finalizar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByText(/Registre al menos una vacuna/)).toBeVisible();

    await page.getByLabel("Vacuna", { exact: true }).fill("Pentavalente");
    await page.getByLabel("Lote").fill("L-2026-01");
    await page.getByRole("button", { name: "Registrar vacuna" }).click();
    await expect(page.getByText("Vacuna registrada.")).toBeVisible();
    await expect(panel).toContainText("Pentavalente");

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/vacunacion-${info.project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(new RegExp(`¿Finalizar la atención de Rosa F\\. \\(${p.numero}\\)\\?`));
    await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByText(/finalizada/)).toBeVisible();
  });

  test("nutrición: evaluación, receta de suplemento y envío a farmacia", async ({ page }, info) => {
    const p = await pasarPorSignos(3, "nutricion", "Elena");
    await ingresarPorPantalla(page, "pnutricion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/nutricion");
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.codigo);
    await page.getByLabel("Diagnóstico nutricional").fill("Desnutrición aguda moderada");
    await page.getByRole("button", { name: "Guardar evaluación" }).click();
    await expect(page.getByText("Evaluación guardada.")).toBeVisible();
    await page.getByRole("button", { name: "Agregar medicamento" }).click();
    await page.getByLabel("Medicamento", { exact: true }).fill("Sulfato ferroso 125 mg/ml");
    await page.getByLabel("Presentación").fill("gotas");
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Indicaciones").fill("10 gotas al día");
    await page.getByRole("button", { name: "Guardar receta" }).click();
    await expect(page.getByText("Receta guardada.")).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/nutricion-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /Enviar a farmacia/i }).click();
    await expect(page.getByRole("alertdialog")).toContainText(new RegExp(`¿Enviar a Elena F\\. \\(${p.numero}\\) a farmacia\\?`, "i"));
    await page.getByRole("alertdialog").getByRole("button", { name: /Enviar a farmacia/i }).click();
    await expect(page.getByText(/pasó a farmacia/i)).toBeVisible();
  });
});
