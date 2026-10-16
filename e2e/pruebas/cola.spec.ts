import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, emergenciaApi, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

test.describe("Colas de atención y signos vitales", () => {
  test("recepción → signos → doctor: llamar, tomar signos, enviar con confirmación y finalizar", async ({ browser, page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Marisol");

    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/signos");
    await expect(page.getByRole("heading", { name: "Signos vitales", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cola de espera" })).toContainText(p.numero);
    await expect(page.getByRole("region", { name: "Cola de espera" })).toContainText(/espera \d+ min/);
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(page.getByText(new RegExp(`Llamó a Marisol F\\. \\(${p.numero}\\)`))).toBeVisible();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.codigo);
    await expect(page.getByRole("button", { name: "Llamar siguiente" })).toBeDisabled();

    // Signos (la talla acepta metros)
    await page.getByLabel("Peso (libras)").fill("115.3");
    await page.getByLabel("Talla (cm)").fill("1.48");
    await page.getByLabel("Temperatura (°C)").fill("36.6");
    await page.getByLabel("Pulso (por minuto)").fill("55");
    await page.getByLabel("Presión alta").fill("139");
    await page.getByLabel("Presión baja").fill("75");
    await page.getByLabel("Saturación de oxígeno (%)").fill("97");
    await page.getByRole("button", { name: "Guardar signos" }).click();
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText("23.9 (Peso normal)");
    await expect(panel).toContainText("148 cm");
    await expect(panel).toContainText("139/75");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/signos-${info.project.name}.png`, fullPage: true });

    // Valores imposibles se rechazan con un mensaje claro
    await page.getByLabel("Temperatura (°C)").fill("60");
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Temperatura (°C)").fill("36.6");

    // Enviar con confirmación que nombra al paciente
    await page.getByRole("button", { name: /Enviar a doctor \(sugerido\)/i }).click();
    await expect(page.getByRole("alertdialog")).toContainText(new RegExp(`¿Enviar a Marisol F\\. \\(${p.numero}\\) a doctor\\?`, "i"));
    await page.getByRole("alertdialog").getByRole("button", { name: /Enviar a doctor/i }).click();
    await expect(page.getByText(new RegExp(`Marisol F\\. \\(${p.numero}\\) pasó a doctor`, "i"))).toBeVisible();
    await expect(page.getByText("No tiene a nadie en atención")).toBeVisible();

    // El doctor lo ve en su cola (con otra sesión), con los signos de hoy
    const ctxDoctor = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const doc = await ctxDoctor.newPage();
    await ingresarPorPantalla(doc, "pdoctor");
    await expect(doc.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await doc.goto("/doctor");
    await expect(doc.getByRole("region", { name: "Cola de espera" })).toContainText(p.numero);
    await doc.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(doc.getByRole("region", { name: "Paciente en atención" })).toContainText("23.9 (Peso normal)");
    await expect(doc.getByRole("button", { name: /Enviar a farmacia/i })).toHaveCount(1); // siempre visible; sin receta pide guardarla
    await doc.getByLabel("Motivo de la consulta").fill("Control general");
    await doc.getByRole("button", { name: "Guardar consulta" }).click();
    await expect(doc.getByText("Consulta guardada.")).toBeVisible();
    await doc.getByRole("button", { name: "Finalizar" }).click();
    await expect(doc.getByRole("alertdialog")).toContainText(new RegExp(`¿Finalizar la atención de Marisol F\\. \\(${p.numero}\\)\\?`));
    await doc.getByRole("alertdialog").getByRole("button", { name: "Finalizar" }).click();
    await expect(doc.getByText(/finalizada/)).toBeVisible();
    await ctxDoctor.close();
  });

  test("la cola se actualiza sola y las emergencias van primero", async ({ browser, page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    await ingresarPorPantalla(page, "pdoctor");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/doctor");
    await expect(page.getByText("No hay pacientes esperando.")).toBeVisible();
    const e = await emergenciaApi(recepcion);
    await expect(page.getByRole("region", { name: "Cola de espera" })).toContainText(e.numero, { timeout: 15000 });
    await expect(page.getByRole("region", { name: "Cola de espera" }).locator(".estado--emergencia").first()).toBeVisible();
    void browser;
  });

  test("dos doctores llamando al mismo tiempo no toman al mismo paciente", async ({ browser }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const e1 = await emergenciaApi(recepcion); const e2 = await emergenciaApi(recepcion);
    const abrir = async (usuario: string) => {
      const ctx = await browser.newContext(); const pg = await ctx.newPage();
      await ingresarPorPantalla(pg, usuario);
      await expect(pg.getByRole("heading", { name: /^Hola, / })).toBeVisible();
      await pg.goto("/doctor");
      await expect(pg.getByRole("region", { name: "Cola de espera" })).toContainText(e1.numero);
      return { ctx, pg };
    };
    const a = await abrir("pdoctor"); const b = await abrir("pdoctora");
    await Promise.all([a.pg.getByRole("button", { name: "Llamar siguiente" }).click(), b.pg.getByRole("button", { name: "Llamar siguiente" }).click()]);
    const numero = async (pg: typeof a.pg) => (await pg.getByRole("region", { name: "Paciente en atención" }).locator(".codigo").nth(1).innerText());
    await expect(a.pg.getByRole("region", { name: "Paciente en atención" })).toContainText(/A-\d+/);
    await expect(b.pg.getByRole("region", { name: "Paciente en atención" })).toContainText(/A-\d+/);
    const na = await numero(a.pg); const nb = await numero(b.pg);
    expect(new Set([na, nb]).size).toBe(2);
    expect([e1.numero, e2.numero].sort()).toEqual([na, nb].sort());
    await a.ctx.close(); await b.ctx.close();
  });

  test("cada área solo entra a su pantalla", async ({ page }) => {
    await ingresarPorPantalla(page, "pfarmacia");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/signos");
    await expect(page.getByRole("heading", { name: "No tiene acceso a esta pantalla" })).toBeVisible();
    await page.goto("/farmacia");
    await expect(page.getByRole("heading", { name: "Farmacia", level: 1 })).toBeVisible();
  });
});
