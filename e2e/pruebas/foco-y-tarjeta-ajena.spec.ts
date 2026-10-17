import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, emergenciaApi, ingresarPorPantalla, pacienteConAtencion } from "./ayudas";

const entrar = async (page: import("@playwright/test").Page, usuario: string) => {
  await ingresarPorPantalla(page, usuario);
  await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
};

test.describe("Foco en diálogos y atención de otra persona", () => {
  test("en el diálogo de envío se escribe una frase completa en el Motivo sin perder el foco", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    await pacienteConAtencion(await apiComo("precepcion"), "Lucía");
    await entrar(page, "psignos");
    await page.goto("/signos");
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(page.getByText(/Llamó a /)).toBeVisible();
    await page.getByRole("button", { name: /^Enviar a Doctor/ }).click();
    const dialogo = page.getByRole("alertdialog");
    const motivo = dialogo.getByLabel("Motivo (opcional)");
    await expect(motivo).toBeFocused();   // al abrir, el foco queda en el campo
    const frase = "Dolor de cabeza fuerte desde ayer";
    await motivo.pressSequentially(frase, { delay: 25 });
    await expect(motivo).toHaveValue(frase);
    await expect(motivo).toBeFocused();   // y no se pierde al escribir
    await expect(dialogo.getByRole("button", { name: "Cancelar" })).not.toBeFocused();
    // Escape sigue cerrando el diálogo
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    await cerrarDia(admin);
  });

  test("Administración abre el detalle de un paciente ajeno y toma su atención", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const p = await pacienteConAtencion(await apiComo("precepcion"), "Olga");
    const signos = await apiComo("psignos", "198.51.100.91");
    expect((await signos.post("/api/cola/signos/llamar-siguiente")).ok()).toBeTruthy();
    await entrar(page, "padmin");
    await page.goto("/signos");
    const tarjeta = page.locator("li.fila-cola--ajena", { hasText: p.numero });
    await expect(tarjeta).toContainText("Lo atiende");
    expect(await tarjeta.evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
    await tarjeta.click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText(p.numero); await expect(dialogo).toContainText("Lo atiende"); await expect(dialogo).toContainText("Desde las");
    await dialogo.getByRole("button", { name: "Tomar atención" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(`(${p.numero})`);
    await page.getByRole("alertdialog").getByRole("button", { name: "Tomar atención" }).click();
    await expect(page.getByText(/Tomó la atención de /)).toBeVisible();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.numero);
    // Bitácora
    const b = await (await admin.get(`/api/bitacora?accion=tomar_atencion&usuario=padmin`)).json();
    expect(b.datos.some((x: { detalle: string | null }) => x.detalle?.includes("signos vitales"))).toBeTruthy();
    await cerrarDia(admin);
  });

  test("Administración devuelve a la cola la atención de otra persona", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const p = await pacienteConAtencion(await apiComo("precepcion"), "Nora");
    const signos = await apiComo("psignos", "198.51.100.92");
    expect((await signos.post("/api/cola/signos/llamar-siguiente")).ok()).toBeTruthy();
    await entrar(page, "padmin");
    await page.goto("/signos");
    await page.locator("li.fila-cola--ajena", { hasText: p.numero }).getByRole("button", { name: /Ver detalle/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Devolver a la cola" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("se descarta");
    await page.getByRole("alertdialog").getByRole("button", { name: "Devolver a la cola" }).click();
    await expect(page.getByText(/volvió a la cola de Signos vitales/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Cola de espera" })).toContainText(p.numero);
    await expect(page.locator("li.fila-cola--ajena")).toHaveCount(0);
    const b = await (await admin.get(`/api/bitacora?accion=devolver_a_cola&usuario=padmin`)).json();
    expect(b.datos.some((x: { detalle: string | null }) => x.detalle?.includes("lo devolvió otra persona"))).toBeTruthy();
    await cerrarDia(admin);
  });

  test("un rol operativo ve el detalle del paciente de otra persona, pero sin acciones", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const e = await emergenciaApi(await apiComo("precepcion"));
    const doctora = await apiComo("pdoctora", "198.51.100.93");
    expect((await doctora.post("/api/cola/doctor/llamar-siguiente")).ok()).toBeTruthy();
    await entrar(page, "pdoctor");
    await page.goto("/doctor");
    await page.locator("li.fila-cola--ajena", { hasText: e.numero }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText(e.numero); await expect(dialogo).toContainText("Lo atiende");
    await expect(dialogo.getByRole("button", { name: "Tomar atención" })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Devolver a la cola" })).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Cerrar" }).click();
    await expect(dialogo).toHaveCount(0);
    await cerrarDia(admin);
  });
});
