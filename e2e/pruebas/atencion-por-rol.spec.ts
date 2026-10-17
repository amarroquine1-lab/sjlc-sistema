import { expect, test, type Page } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, cuiAleatorio, emergenciaApi, ingresarPorPantalla, pacienteConAtencion, sufijoLetras } from "./ayudas";

const fechaAleatoria = () => new Date(Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 19000) * 86400000).toISOString().slice(0, 10);
const aviso = (p: Page, texto: RegExp) => p.getByText(texto);

async function llamarSiguiente(page: Page, ruta: string, titulo: string) {
  await page.goto(ruta);
  await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Llamar siguiente" }).click();
  await expect(aviso(page, /Llamó a /)).toBeVisible();
}
async function enviarA(page: Page, destino: RegExp) {
  await page.getByRole("button", { name: destino }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Enviar a / }).click();
  await expect(aviso(page, /\(A-\d{6,}\).* (pasó|fue enviado|enviado)|Enviad|envió/i).first()).toBeVisible();
}

test.describe("Atención por rol y devolver a la cola", () => {
  test("Administración recorre todas las áreas: recepción → signos → doctor → vacunación → nutrición → farmacia", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    await ingresarPorPantalla(page, "padmin");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();

    // Recepción: registrar y abrir la atención
    await page.goto("/recepcion/nuevo");
    await page.getByLabel("Nombres", { exact: true }).fill("Marta");
    await page.getByLabel("Apellidos", { exact: true }).fill(`Recorrido ${sufijoLetras()}`);
    await page.getByLabel("Fecha de nacimiento").fill(fechaAleatoria());
    await page.getByLabel("Mujer").check();
    await page.getByLabel("DPI/CUI").fill(cuiAleatorio());
    await page.getByLabel("Dirección (calle, avenida y número)").fill("5a avenida 10-20");
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByText(/Paciente registrado con el código SJLC-\d{6,}/)).toBeVisible();
    await page.getByRole("button", { name: "Consulta general" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abrir consulta general" }).click();
    const abierta = await page.getByText(/Atención A-\d{6,} abierta para /).textContent();
    const numero = /A-\d{6,}/.exec(abierta ?? "")![0];

    // Signos → Doctor
    await llamarSiguiente(page, "/signos", "Signos vitales");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(numero);
    await enviarA(page, /^Enviar a Doctor/);
    // Doctor → Vacunación
    await llamarSiguiente(page, "/doctor", "Consulta médica");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(numero);
    await enviarA(page, /^Enviar a Vacunaci/);
    // Vacunación → Nutrición
    await llamarSiguiente(page, "/vacunacion", "Vacunación");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(numero);
    await enviarA(page, /^Enviar a Nutrici/);
    // Nutrición → Farmacia (Farmacia solo recibe pacientes con receta)
    await llamarSiguiente(page, "/nutricion", "Nutrición");
    const idAtencion = (await (await admin.get("/api/cola/nutricion")).json()).mi_atencion.id_atencion as number;
    expect((await admin.put(`/api/atenciones/${idAtencion}/receta`, { data: { lineas: [{ medicamento: "Zinc 20 mg", presentacion: "tableta", cantidad_recetada: 10, indicaciones: "1 al día" }] } })).ok()).toBeTruthy();
    await page.reload();
    await enviarA(page, /^Enviar a Farmacia/);
    // Farmacia: llama y queda en atención
    await llamarSiguiente(page, "/farmacia", "Farmacia");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(numero);
    await cerrarDia(admin);
  });

  test("Administración tiene pacientes abiertos en dos áreas a la vez y en cada una ve el suyo", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Irma");
    const e = await emergenciaApi(recepcion);
    expect((await admin.post(`/api/cola/signos/atender/${p.idAtencion}`)).ok()).toBeTruthy();
    expect((await admin.post("/api/cola/doctor/llamar-siguiente")).ok()).toBeTruthy();

    await ingresarPorPantalla(page, "padmin");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/signos");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.numero);
    await expect(page.getByRole("button", { name: "Llamar siguiente" })).toBeDisabled();
    await page.goto("/doctor");
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(e.numero);
    await expect(page.getByRole("button", { name: "Llamar siguiente" })).toBeDisabled();
    await cerrarDia(admin);
  });

  test("Devolver a la cola: pide confirmación, conserva la posición y deja libre para llamar otro", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p1 = await pacienteConAtencion(recepcion, "Carmen"); const p2 = await pacienteConAtencion(recepcion, "Julio");
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await llamarSiguiente(page, "/signos", "Signos vitales");
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText(p1.numero);

    await panel.getByRole("button", { name: "Devolver a la cola" }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText(p1.numero);
    await expect(dialogo).toContainText("se descartarán");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(panel).toContainText(p1.numero);   // cancelar no hace nada

    await panel.getByRole("button", { name: "Devolver a la cola" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Devolver a la cola" }).click();
    await expect(aviso(page, /volvió a la cola de Signos vitales/)).toBeVisible();
    await expect(page.getByText("No tiene a nadie en atención.")).toBeVisible();
    const cola = page.getByRole("region", { name: "Cola de espera" });
    await expect(cola.locator("li").first()).toContainText(p1.numero);   // sigue primero
    await expect(cola).toContainText(p2.numero);
    await expect(page.getByRole("button", { name: "Llamar siguiente" })).toBeEnabled();
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(panel).toContainText(p1.numero);
    await cerrarDia(admin);
  });

  test("Devolver a la cola con datos ya guardados se rechaza y explica el motivo", async ({ page }) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion"); const signos = await apiComo("psignos", "198.51.100.89");
    const p = await pacienteConAtencion(recepcion, "Berta");
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await llamarSiguiente(page, "/signos", "Signos vitales");
    expect((await signos.post(`/api/atenciones/${p.idAtencion}/signos`, { data: { peso_lb: 120 } })).status()).toBe(201);
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await panel.getByRole("button", { name: "Devolver a la cola" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Devolver a la cola" }).click();
    await expect(page.getByText(/ya se guardaron datos de este paciente/)).toBeVisible();
    await expect(panel).toContainText(p.numero);
    await cerrarDia(admin);
  });
});
