import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ingresarPorPantalla, sinDesbordeHorizontal } from "./ayudas";

function cuiAleatorio(): string {
  for (;;) {
    const base = String(10000000 + Math.floor(Math.random() * 89999999));
    let t = 0; for (let i = 0; i < 8; i++) t += Number(base[i]) * (i + 2);
    if (t % 11 < 10) return `${base}${t % 11}0108`;
  }
}
// El sistema guarda los nombres con mayúscula inicial; el sufijo ya viene así para comparar el texto tal cual.
const sufijo = () => { const s = Array.from(String(Date.now()) + Math.floor(Math.random() * 1000), (d) => "abcdefghij"[Number(d)]).join("").slice(-9); return s[0].toUpperCase() + s.slice(1); };
const fechaAleatoria = () => new Date(Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 19000) * 86400000).toISOString().slice(0, 10);

async function registrarAdulto(page: Page, nombres = "Rosa María", apellidos = `Pérez ${sufijo()}`) {
  await page.goto("/recepcion/nuevo");
  await page.getByLabel("Nombres", { exact: true }).fill(nombres);
  await page.getByLabel("Apellidos", { exact: true }).fill(apellidos);
  await page.getByLabel("Fecha de nacimiento").fill(fechaAleatoria());
  await page.getByLabel("Mujer").check();
  const cui = cuiAleatorio();
  await page.getByLabel("DPI/CUI").fill(cui);
  await page.getByLabel("Dirección (calle, avenida y número)").fill("5a avenida 10-20");
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page.getByText(/Paciente registrado con el código SJLC-\d{6,}/)).toBeVisible();
  return { nombres, apellidos, cui };
}

test.describe("Recepción", () => {
  test.beforeEach(async ({ page }) => {
    await ingresarPorPantalla(page, "precepcion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  });

  test("registra un paciente con Guatemala / Mixco / zona 10 prellenados, abre la atención y llega al ticket", async ({ page }, info) => {
    await page.goto("/recepcion/nuevo");
    await expect(page.getByLabel("Departamento")).toHaveValue("1");
    await expect(page.getByLabel("Municipio")).toHaveValue("108");
    await expect(page.getByLabel("Zona")).toHaveValue("10");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/recepcion-formulario-${info.project.name}.png`, fullPage: true });

    const p = await registrarAdulto(page);
    await expect(page.getByRole("heading", { name: `${p.nombres} ${p.apellidos}` })).toBeVisible();
    await expect(page.getByText(p.cui)).toBeVisible();
    const axe2 = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe2.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/recepcion-${info.project.name}.png` });

    await page.getByRole("button", { name: "Consulta general" }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText("Consulta general");
    await expect(dialogo).toContainText(/Rosa P\. \(SJLC-\d{6,}\)/);
    await dialogo.getByRole("button", { name: "Abrir consulta general" }).click();
    await expect(page.getByText(/Atención A-\d{6,} abierta para Rosa P\.: pasó a signos vitales\./)).toBeVisible();
    await expect(page.getByText(/Tiene la atención/)).toBeVisible();
    // Una segunda atención no se puede abrir
    await expect(page.getByRole("button", { name: "Consulta general" })).toHaveCount(0);

    await page.getByRole("button", { name: "Imprimir ticket" }).first().click();
    await expect(page).toHaveURL(/\/recepcion\/ticket\/\d+$/);
    const ticket = page.getByRole("article", { name: "Ticket de atención" });
    await expect(ticket).toContainText("Centro de Salud San José La Comunidad");
    await expect(ticket).toContainText(/A-\d{6,}/);
    await expect(ticket).toContainText("Rosa P.");
    await expect(ticket).not.toContainText(p.cui);
    await expect(page.getByRole("img", { name: /Código QR de la atención A-/ })).toBeVisible();
    await expect(page.getByText(/Código de barras/)).toHaveCount(0);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".barra")).toBeHidden();
    await expect(ticket).toBeVisible();
    const ancho = (await ticket.boundingBox())!.width; // 80 mm a 96 ppp = 302 px
    expect(ancho).toBeGreaterThan(298); expect(ancho).toBeLessThan(306);
    await page.screenshot({ path: `/tmp/e2e-resultados/ticket-${info.project.name}.png` });
  });

  test("busca sin importar tildes ni mayúsculas, por código y por fecha", async ({ page }) => {
    const p = await registrarAdulto(page, "José Ángel", `Búsqueda ${sufijo()}`);
    await page.getByRole("searchbox").fill(`jose angel ${p.apellidos.toUpperCase().replace("Ú", "U")}`);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: `${p.nombres} ${p.apellidos}` })).toBeVisible();
    const codigo = await page.locator(".panel .codigo").first().innerText();
    await page.getByRole("searchbox").fill(codigo);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: `${p.nombres} ${p.apellidos}` })).toBeVisible();
    await page.getByRole("searchbox").fill("zzzzzzzz");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText("No se encontró a nadie.")).toBeVisible();
  });

  test("avisa de un posible duplicado y permite registrarlo si es otra persona", async ({ page }) => {
    const ap = `Duplicado ${sufijo()}`;
    const fecha = fechaAleatoria();
    const llenar = async (cui: string) => {
      await page.goto("/recepcion/nuevo");
      await page.getByLabel("Nombres", { exact: true }).fill("María José");
      await page.getByLabel("Apellidos", { exact: true }).fill(ap);
      await page.getByLabel("Fecha de nacimiento").fill(fecha);
      await page.getByLabel("Mujer").check();
      await page.getByLabel("DPI/CUI").fill(cui);
      await page.getByRole("button", { name: "Registrar paciente" }).click();
    };
    await llenar(cuiAleatorio());
    await expect(page.getByText(/Paciente registrado/)).toBeVisible();
    await llenar(cuiAleatorio());
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText("Ya existe alguien parecido");
    await dialogo.getByRole("button", { name: "Es otra persona, registrar" }).click();
    await expect(page.getByText(/Paciente registrado/)).toBeVisible();
  });

  test("un menor necesita encargado y se muestra el apartado al elegir su fecha de nacimiento", async ({ page }) => {
    await page.goto("/recepcion/nuevo");
    await expect(page.getByRole("heading", { name: "Encargado del menor" })).toHaveCount(0);
    await page.getByLabel("Nombres", { exact: true }).fill("Niño");
    await page.getByLabel("Apellidos", { exact: true }).fill(`Menor ${sufijo()}`);
    await page.getByLabel("Fecha de nacimiento").fill("2022-02-02");
    await page.getByLabel("Hombre").check();
    await expect(page.getByRole("heading", { name: "Encargado del menor" })).toBeVisible();
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Revise los campos marcados");
    await page.getByLabel("Nombres del encargado").fill("Marta");
    await page.getByLabel("Apellidos del encargado").fill("Responsable");
    await page.getByLabel("Parentesco").fill("Madre");
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByText(/Paciente registrado/)).toBeVisible();
    await expect(page.getByText("Marta Responsable")).toBeVisible();
  });

  test("emergencia: registro rápido, directo al doctor y en la lista de datos incompletos", async ({ page }) => {
    await page.goto("/recepcion/emergencia");
    await page.getByLabel("Hombre").check();
    await page.getByLabel("Edad aproximada (años)").fill("40");
    await page.getByRole("button", { name: "Registrar emergencia" }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText("hombre de unos 40 años");
    await dialogo.getByRole("button", { name: "Registrar y enviar al doctor" }).click();
    await expect(page.getByText(/Emergencia registrada: A-\d{6,}\. Pasó directo al doctor\./)).toBeVisible();
    await page.getByRole("tab", { name: /Datos incompletos/ }).click();
    await expect(page.locator(".estado--en_espera", { hasText: "Datos incompletos" }).first()).toBeVisible();
    await page.getByRole("tab", { name: /Atenciones abiertas/ }).click();
    await expect(page.locator(".estado--emergencia").first()).toBeVisible();
  });

  test("marca que un paciente se retiró con confirmación que lo nombra", async ({ page }) => {
    const p = await registrarAdulto(page, "Lucía", `Retiro ${sufijo()}`);
    await page.getByRole("button", { name: "Nutrición directa" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^Abrir nutrición directa/i }).click();
    await expect(page.getByText(/abierta para Lucía R\./)).toBeVisible();
    await page.getByRole("button", { name: "Se retiró" }).first().click();
    await expect(page.getByRole("alertdialog")).toContainText(/Lucía R\. \(A-\d{6,}\) se retiró/);
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, se retiró" }).click();
    await expect(page.getByText(/Se anotó que Lucía R\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Consulta general" })).toBeVisible();
    expect(p.cui.length).toBe(13);
  });

  test("une dos registros con motivo y confirmación", async ({ page }) => {
    const a = await registrarAdulto(page, "Elena", `Unir ${sufijo()}`);
    const codigoA = await page.locator(".panel .codigo").first().innerText();
    await page.goto("/recepcion/emergencia");
    await page.getByLabel("Mujer").check();
    await page.getByLabel("Edad aproximada (años)").fill("30");
    await page.getByRole("button", { name: "Registrar emergencia" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Registrar y enviar al doctor" }).click();
    await expect(page.getByText(/Emergencia registrada/)).toBeVisible();
    const codigoE = await page.locator(".panel .codigo").first().innerText();
    // el registro de la emergencia queda seleccionado: se busca el registro conservado (completo)
    await page.getByRole("button", { name: "Unir con otro registro" }).click();
    await page.getByRole("group", { name: "Unir registros" }).getByRole("searchbox").fill(codigoA);
    await page.getByRole("group", { name: "Unir registros" }).getByRole("button", { name: "Buscar" }).click();
    await page.getByLabel("Motivo de la unión").fill("Era la misma persona atendida de emergencia");
    await page.getByRole("button", { name: "Unir este registro" }).click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText(codigoA);
    await expect(dialogo).toContainText(codigoE);
    await dialogo.getByRole("button", { name: "Unir registros" }).click();
    // El registro completo es el que se conserva: la emergencia queda unida a él
    await expect(page.getByText(new RegExp(`Se unió ${codigoE} en ${codigoA}`))).toBeVisible();
    expect(a.cui.length).toBe(13);
  });

  test("otras áreas no entran a recepción y la pantalla de recepción es accesible", async ({ page }) => {
    await page.goto("/recepcion");
    await expect(page.getByRole("heading", { name: "Recepción", level: 1 })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.getByRole("button", { name: "Salir" }).click();
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/recepcion");
    await expect(page.getByRole("heading", { name: "No tiene acceso a esta pantalla" })).toBeVisible();
  });
});
