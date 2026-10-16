import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal } from "./ayudas";

test.describe("Historial y administración", () => {
  test("el historial muestra el recorrido y lo registrado; el acceso queda en bitácora", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Teresa");
    const signos = await apiComo("psignos", "198.51.100.93");
    const id = (await (await signos.post("/api/cola/signos/llamar-siguiente")).json()).atencion.id_atencion;
    await signos.post(`/api/atenciones/${id}/signos`, { data: { peso_lb: 128, talla_cm: 158, temperatura_c: 36.8 } });
    await signos.post(`/api/atenciones/${id}/enviar`, { data: { destino: "doctor" } });
    const doc = await apiComo("pdoctor", "198.51.100.94");
    await doc.post("/api/cola/doctor/llamar-siguiente");
    await doc.put(`/api/atenciones/${id}/consulta`, { data: { tipo_consulta: "primera", motivo_consulta: "Dolor abdominal", diagnosticos: [{ descripcion_diagnostico: "Gastritis", codigo_cie10: "K29.7" }] } });
    await doc.post(`/api/atenciones/${id}/enviar`, { data: { destino: "finalizar" } });

    await ingresarPorPantalla(page, "pnutricion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/historial");
    await page.getByRole("search").getByRole("searchbox").fill(p.codigo);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: "Ver historial" }).click();
    const h = page.getByRole("region", { name: "Historial" });
    await expect(h).toContainText(p.numero);
    await expect(h).toContainText("Gastritis (K29.7)");
    await expect(h).toContainText("peso 128 lb");
    await expect(h).toContainText("doctor: llegó");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/historial-${info.project.name}.png`, fullPage: true });

    const b = await (await admin.get(`/api/bitacora?accion=ver_historial&usuario=pnutricion`)).json();
    expect(b.datos.length).toBeGreaterThan(0);
  });

  test("el administrador crea un usuario, ve la bitácora filtrada y el estado de las colas", async ({ page }, info) => {
    await ingresarPorPantalla(page, "padmin");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/administracion/usuarios");
    const sufijo = Array.from(String(Date.now()), (d) => "abcdefghij"[Number(d)]).join("").slice(-8);
    await page.getByRole("group", { name: "Crear usuario" }).or(page.locator("form[aria-label='Crear usuario']")).getByLabel("Nombres").fill("Carla");
    await page.getByLabel("Apellidos").fill(`Prueba${sufijo}`);
    await page.getByLabel("Rol").selectOption({ label: "Farmacia" });
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText(/Contraseña temporal de/)).toBeVisible();
    await page.getByLabel("Buscar por nombre o usuario").fill(`prueba${sufijo}`);
    const fila = page.getByRole("row").filter({ hasText: `Prueba${sufijo}` });
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: /^Desactivar c/ }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/¿Desactivar Carla/);
    await page.getByRole("alertdialog").getByRole("button", { name: "Desactivar" }).click();
    await expect(fila).toContainText("Desactivado");
    await sinDesbordeHorizontal(page);

    await page.goto("/administracion/bitacora");
    await page.getByLabel("Acción").selectOption("crear");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("row", { name: /crear/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Ver cambio/ }).first().click();
    await expect(page.getByRole("region", { name: "Detalle del cambio" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Detalle del cambio" })).not.toContainText("argon2");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `/tmp/e2e-resultados/bitacora-${info.project.name}.png`, fullPage: true });

    await page.goto("/administracion/colas");
    await expect(page.getByRole("heading", { name: "Estado de las colas" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Doctor/ })).toBeVisible();
  });

  test("las áreas no administran usuarios ni ven la bitácora", async ({ page }) => {
    await ingresarPorPantalla(page, "pfarmacia");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/administracion/usuarios");
    await expect(page.getByRole("heading", { name: "No tiene acceso a esta pantalla" })).toBeVisible();
    await page.goto("/administracion/bitacora");
    await expect(page.getByRole("heading", { name: "No tiene acceso a esta pantalla" })).toBeVisible();
  });
});
