import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

test.describe("Flujo completo: consulta → farmacia", () => {
  test("el doctor receta, farmacia entrega por renglón con faltante y finaliza", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Gloria");
    const signos = await apiComo("psignos", "198.51.100.91");
    const id = (await (await signos.post("/api/cola/signos/llamar-siguiente")).json()).atencion.id_atencion;
    await signos.post(`/api/atenciones/${id}/enviar`, { data: { destino: "doctor" } });
    const doc = await apiComo("pdoctor", "198.51.100.92");
    await doc.post("/api/cola/doctor/llamar-siguiente");
    expect((await doc.put(`/api/atenciones/${id}/consulta`, { data: { tipo_consulta: "primera", motivo_consulta: "Dolor de cabeza", diagnosticos: [{ descripcion_diagnostico: "Cefalea" }] } })).ok()).toBeTruthy();
    expect((await doc.put(`/api/atenciones/${id}/receta`, { data: { lineas: [{ medicamento: "Acetaminofén 500 mg", presentacion: "tableta", cantidad_recetada: 20, indicaciones: "1 cada 8 horas" }] } })).ok()).toBeTruthy();
    expect((await doc.post(`/api/atenciones/${id}/enviar`, { data: { destino: "farmacia" } })).ok()).toBeTruthy();

    await ingresarPorPantalla(page, "pfarmacia");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/farmacia");
    await expect(page.getByRole("region", { name: "Cola de espera" })).toContainText(p.numero);
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText("Acetaminofén");

    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar" }).click();
    await expect(page.getByText(/Registre la entrega/)).toBeVisible();

    await page.getByLabel("Entregado").fill("12");
    await page.getByRole("button", { name: "Entregar y finalizar atención" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "motivo" })).toBeVisible();
    await page.getByLabel("Observación").fill("Sin existencia");
    await page.getByLabel("Recibe (nombre, opcional)").fill("Gloria");

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/farmacia-${info.project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Entregar y finalizar atención" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(new RegExp(`finalizar la atención de Gloria F\\. \\(${p.numero}\\)\\?`));
    await page.getByRole("alertdialog").getByRole("button", { name: "Entregar y finalizar" }).click();
    await expect(page.getByText(/finalizada/)).toBeVisible();
  });
});
