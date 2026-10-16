import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

test.describe("Doctor: consulta, receta y envío a farmacia", () => {
  test("consulta con diagnóstico, receta con medicamento del catálogo, próximo control y envío a farmacia", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Lorena");
    const signos = await apiComo("psignos", "198.51.100.89");
    const id = (await (await signos.post("/api/cola/signos/llamar-siguiente")).json()).atencion.id_atencion;
    expect((await signos.post(`/api/atenciones/${id}/enviar`, { data: { destino: "doctor" } })).ok()).toBeTruthy();

    await ingresarPorPantalla(page, "pdoctor");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/doctor");
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText(p.codigo);

    // Sin consulta no se puede enviar
    await page.getByRole("button", { name: /Finalizar/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByText(/Registre la consulta/)).toBeVisible();

    await page.getByLabel("Motivo de la consulta").fill("Dolor de garganta y fiebre");
    await page.getByLabel("Diagnóstico 1").fill("Faringitis aguda");
    await page.getByLabel("CIE-10").fill("J02.9");
    await page.getByLabel("Conducta o tratamiento").fill("Reposo, líquidos y antibiótico");
    await page.getByRole("button", { name: "Guardar consulta" }).click();
    await expect(page.getByText("Consulta guardada.")).toBeVisible();

    // Receta
    // Farmacia siempre está visible; sin receta guardada pide primero la receta y no abre confirmación
    await page.getByRole("button", { name: /Enviar a farmacia/i }).click();
    await expect(page.getByText("Primero agregue y guarde la receta")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finalizar" })).toBeVisible();
    await page.getByRole("button", { name: "Agregar medicamento" }).click();
    await page.getByLabel("Medicamento", { exact: true }).fill("Amoxicilina 500 mg");
    await page.getByLabel("Presentación").fill("cápsula");
    await page.getByLabel("Cantidad").fill("15");
    await page.getByLabel("Indicaciones").fill("1 cápsula cada 8 horas por 5 días");
    await page.getByRole("button", { name: "Guardar receta" }).click();
    await expect(page.getByText("Receta guardada.")).toBeVisible();

    // Próximo control
    await page.getByLabel("Qué queda pendiente").fill("Control en 1 semana");
    await page.getByRole("button", { name: "Agregar pendiente" }).click();
    await expect(panel).toContainText("Control en 1 semana");

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/doctor-${info.project.name}.png`, fullPage: true });

    // Con receta, farmacia es el destino sugerido y la confirmación nombra al paciente
    await page.getByRole("button", { name: /Enviar a farmacia \(sugerido\)/i }).click();
    await expect(page.getByRole("alertdialog")).toContainText(new RegExp(`¿Enviar a Lorena F\\. \\(${p.numero}\\) a farmacia\\?`, "i"));
    await page.getByRole("alertdialog").getByLabel("Motivo (opcional)").fill("Entregar con indicaciones por escrito");
    await page.getByRole("alertdialog").getByRole("button", { name: /Enviar a farmacia/i }).click();
    await expect(page.getByText(new RegExp(`Lorena F\\. \\(${p.numero}\\) pasó a farmacia`, "i"))).toBeVisible();
  });

  test("otras áreas no entran a la consulta médica", async ({ page }) => {
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/doctor");
    await expect(page.getByRole("heading", { name: "Consulta médica", level: 1 })).toHaveCount(0);
  });
});
