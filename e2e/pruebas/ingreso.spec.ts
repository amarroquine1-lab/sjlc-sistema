import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { CONTRASENA, apiAdmin, crearUsuario, idDeRol, ingresarPorPantalla, sinDesbordeHorizontal } from "./ayudas";

test.describe("Ingreso, inicio y salida", () => {
  test("la pantalla de ingreso es accesible, sin desbordes y sin errores de CSP", async ({ page }, info) => {
    const errores: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) errores.push(m.text()); });
    // (el 401 de /api/yo sin sesión es esperado y se ignora)
    await page.goto("/ingreso");
    await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
    await expect(page.getByLabel("Usuario")).toBeFocused();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/ingreso-${info.project.name}.png` });
    expect(errores).toEqual([]);
  });

  test("una contraseña incorrecta muestra un mensaje claro y no deja pasar", async ({ page }) => {
    await ingresarPorPantalla(page, "psignos", "Contrasena-equivocada-1");
    await expect(page.getByRole("alert")).toContainText("Usuario o contraseña incorrectos.");
    await expect(page).toHaveURL(/\/ingreso$/);
  });

  test("campos vacíos piden el usuario y la contraseña", async ({ page }) => {
    await page.goto("/ingreso");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("alert")).toContainText("Escriba su usuario y su contraseña.");
  });

  test("un usuario con letras mayúsculas o espacios recibe una ayuda clara", async ({ page }) => {
    await ingresarPorPantalla(page, "p signos 1");
    await expect(page.getByRole("alert")).toContainText("solo lleva letras minúsculas");
  });

  test("ingresa, ve solo los módulos de su rol, la barra con su área y puede salir", async ({ page }, info) => {
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Signos vitales");
    await expect(page.getByRole("banner")).toContainText("Centro de Salud San José La Comunidad");
    await expect(page.getByRole("heading", { name: "Signos vitales", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historial del paciente", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Usuarios", level: 3 })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recepción", level: 3 })).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/inicio-${info.project.name}.png` });
    const salir = page.getByRole("button", { name: "Salir" });
    const caja = await salir.boundingBox();
    expect(caja!.height).toBeGreaterThanOrEqual(48);
    await salir.click();
    await expect(page).toHaveURL(/\/ingreso$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/ingreso$/);
  });

  test("el administrador ve todos los módulos y recepción solo los suyos", async ({ page }) => {
    await ingresarPorPantalla(page, "padmin");
    for (const t of ["Recepción", "Signos vitales", "Consulta médica", "Nutrición", "Vacunación", "Farmacia", "Usuarios", "Reportes"]) {
      await expect(page.getByRole("heading", { name: t, level: 3 })).toBeVisible();
    }
    await page.getByRole("button", { name: "Salir" }).click();
    await ingresarPorPantalla(page, "precepcion");
    await expect(page.getByRole("heading", { name: "Recepción", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Farmacia", level: 3 })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Usuarios", level: 3 })).toHaveCount(0);
  });

  test("primer ingreso: obliga a cambiar la contraseña temporal", async ({ page }) => {
    const admin = await apiAdmin();
    const u = await crearUsuario(admin, await idDeRol(admin, "farmacia"));
    await ingresarPorPantalla(page, u.nombre, u.temporal);
    await expect(page).toHaveURL(/\/cambiar-contrasena$/);
    await expect(page.getByRole("heading", { name: "Elija su contraseña" })).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/cambiar-contrasena$/);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    // Errores
    await page.getByLabel("Contraseña actual (la temporal)").fill(u.temporal);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("Clave-Nueva-8421");
    await page.getByLabel("Repita la contraseña nueva").fill("Clave-Nueva-0000");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("no coinciden");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("corta");
    await page.getByLabel("Repita la contraseña nueva").fill("corta");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("al menos 10 caracteres");
    // Correcto
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("Clave-Nueva-8421");
    await page.getByLabel("Repita la contraseña nueva").fill("Clave-Nueva-8421");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Farmacia", level: 3 })).toBeVisible();
  });

  test("si la sesión se cierra en otro lugar, al recargar se vuelve al ingreso", async ({ page }) => {
    await ingresarPorPantalla(page, "pvacunacion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    const r = await page.request.post("/api/autenticacion/salir");
    expect(r.ok()).toBeTruthy();
    await page.reload();
    await expect(page).toHaveURL(/\/ingreso$/);
  });

  test("una ruta inexistente muestra un mensaje claro", async ({ page }) => {
    await page.goto("/no-existe");
    await expect(page.getByRole("heading", { name: "Esa pantalla no existe" })).toBeVisible();
  });

  test("la contraseña se puede mostrar y ocultar", async ({ page }) => {
    await page.goto("/ingreso");
    const campo = page.getByLabel("Contraseña", { exact: true });
    await campo.fill("secreta-123");
    await expect(campo).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar" }).click();
    await expect(campo).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar" }).click();
    await expect(campo).toHaveAttribute("type", "password");
    expect(CONTRASENA.length).toBeGreaterThan(0);
  });
});
