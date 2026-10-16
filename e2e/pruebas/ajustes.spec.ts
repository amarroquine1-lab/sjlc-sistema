import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, cuiAleatorio, emergenciaApi, ingresarPorPantalla, pacienteConAtencion, sinDesbordeHorizontal, sufijoLetras } from "./ayudas";

const fecha = () => new Date(Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 19000) * 86400000).toISOString().slice(0, 10);

test.describe("Ajustes de la revisión", () => {
  test("el botón Inicio está en todas las pantallas y lleva a la pantalla principal", async ({ page }) => {
    await ingresarPorPantalla(page, "padmin");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    for (const ruta of ["/recepcion", "/doctor", "/administracion/bitacora", "/reportes", "/historial", "/farmacia"]) {
      await page.goto(ruta);
      const inicio = page.getByRole("banner").getByRole("link", { name: "Inicio" });
      await expect(inicio).toBeVisible();
      await expect(page.getByRole("banner").getByRole("button", { name: "Salir" })).toBeVisible();
      await inicio.click();
      await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    }
  });

  test("recepción: formulario sin colonia, 'Más datos' plegable, mayúscula inicial, cancelar, cerrar y editar con confirmación en bitácora", async ({ page }, info) => {
    const admin = await apiAdmin();
    await ingresarPorPantalla(page, "precepcion");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/recepcion/nuevo");
    await expect(page.getByLabel("Colonia o sector")).toHaveCount(0);
    const mas = page.locator("details.mas-datos");
    await expect(mas).not.toHaveAttribute("open", "");
    await expect(page.getByLabel("Pueblo")).toBeHidden();
    await mas.getByText("Más datos (opcional)").click();
    await expect(page.getByLabel("Pueblo")).toBeVisible();
    await expect(page.getByLabel("Comunidad lingüística")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/recepcion$/);

    // Mayúscula inicial al guardar
    const ap = `perez ${sufijoLetras()}`;
    await page.goto("/recepcion/nuevo");
    await page.getByLabel("Nombres", { exact: true }).fill("jose luis");
    await page.getByLabel("Apellidos", { exact: true }).fill(ap);
    await page.getByLabel("Fecha de nacimiento").fill(fecha());
    await page.getByLabel("Mujer").check();
    await page.getByLabel("DPI/CUI").fill("123");
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByText("El DPI/CUI debe tener 13 números")).toBeVisible();
    await page.getByLabel("DPI/CUI").fill(cuiAleatorio());
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    const esperado = `Jose Luis Perez ${ap.split(" ")[1][0].toUpperCase()}${ap.split(" ")[1].slice(1)}`;
    await expect(page.getByRole("heading", { name: esperado })).toBeVisible();

    // Cerrar el panel del paciente
    const panel = page.getByRole("region", { name: "Paciente seleccionado" });
    await panel.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByText("Ningún paciente seleccionado")).toBeVisible();

    // Unir: el panel se puede cancelar
    await page.getByRole("searchbox").fill(ap);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.getByRole("button", { name: "Unir con otro registro" }).click();
    const unir = page.getByRole("group", { name: "Unir registros" });
    await expect(unir).toBeVisible();
    await unir.getByRole("button", { name: "Cancelar" }).click();
    await expect(unir).toBeHidden();

    // Editar datos del paciente: queda en bitácora con el valor anterior y el nuevo
    await page.getByRole("button", { name: "Editar datos del paciente" }).click();
    await expect(page.getByRole("heading", { name: /Editar datos de/ })).toBeVisible();
    await expect(page.getByLabel("Nombres", { exact: true })).not.toHaveValue("");
    await page.getByLabel("Teléfono", { exact: true }).fill("55557777");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Datos guardados.")).toBeVisible();
    const b = await (await admin.get("/api/bitacora?accion=editar&entidad=pacientes&usuario=precepcion&por_pagina=10")).json();
    const detalles = await Promise.all(b.datos.map(async (f: { id_bitacora: number }) => (await admin.get(`/api/bitacora/${f.id_bitacora}`)).json()));
    const mio = detalles.find((d: { valor_nuevo: { telefono?: string } | null }) => d.valor_nuevo?.telefono === "55557777");
    expect(mio, "el cambio de teléfono debe estar en la bitácora").toBeTruthy();
    expect(mio.valor_anterior).toBeTruthy();
    expect(mio.valor_anterior.telefono).not.toBe("55557777");
    await page.screenshot({ path: `/tmp/e2e-resultados/recepcion-ajustes-${info.project.name}.png`, fullPage: true });
  });

  test("signos: peso en libras y mensajes de error por campo", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const p = await pacienteConAtencion(recepcion, "Lucía");
    await ingresarPorPantalla(page, "psignos");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/signos");
    await page.getByRole("button", { name: "Llamar siguiente" }).click();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.codigo);
    await page.getByLabel("Peso (libras)").fill("900");
    await page.getByLabel("Saturación de oxígeno (%)").fill("120");
    await page.getByRole("button", { name: "Guardar signos" }).click();
    await expect(page.getByText("La saturación debe estar entre 50 y 100")).toBeVisible();
    await expect(page.getByText("El peso debe estar entre 0.7 y 660 libras")).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: `/tmp/e2e-resultados/signos-errores-${info.project.name}.png`, fullPage: true });
    await page.getByLabel("Peso (libras)").fill("150");
    await page.getByLabel("Saturación de oxígeno (%)").fill("97");
    await page.getByRole("button", { name: "Guardar signos" }).click();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText("150 lb");
  });

  test("'Atender' toma a un paciente específico de la lista; el otro usuario recibe un aviso claro", async ({ page, browser }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const e1 = await emergenciaApi(recepcion); const e2 = await emergenciaApi(recepcion);
    await ingresarPorPantalla(page, "pdoctor");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/doctor");
    const cola = page.getByRole("region", { name: "Cola de espera" });
    await expect(cola).toContainText(e1.numero);
    await expect(cola.getByRole("button", { name: /^Atender/ })).toHaveCount(2);
    await page.screenshot({ path: `/tmp/e2e-resultados/cola-atender-${info.project.name}.png`, fullPage: true });
    // la segunda de la lista, sin pasar por el orden
    await cola.getByRole("button", { name: new RegExp(`^Atender a .*\\(${e2.numero}\\)`) }).click();
    const panel = page.getByRole("region", { name: "Paciente en atención" });
    await expect(panel).toContainText(e2.numero);
    await expect(page.getByRole("button", { name: "Llamar siguiente" })).toBeDisabled();
    // otro doctor intenta tomar al mismo por la API
    const otro = await apiComo("pdoctora", "198.51.100.95");
    const r = await otro.post(`/api/cola/doctor/atender/${e2.idAtencion}`);
    expect(r.status()).toBe(409);
    expect((await r.json()).error.codigo).toBe("YA_TOMADA");
    // y queda registrado quién lo tomó
    const fila = await (await admin.get("/api/cola/doctor")).json();
    expect(fila.en_atencion.find((f: { numero_atencion: string }) => f.numero_atencion === e2.numero).atiende).toMatch(/\w+/);
    void browser;
  });

  test("receta en texto libre con sugerencias de lo ya escrito y cierre del flujo doctor → farmacia → finalizar", async ({ page }, info) => {
    const admin = await apiAdmin(); await cerrarDia(admin);
    const recepcion = await apiComo("precepcion");
    const medicamento = `Elixir Raro ${sufijoLetras()} 7 mg`;
    // primera receta (por API) para que el texto exista como antecedente
    const doc0 = await apiComo("pdoctor", "198.51.100.96");
    const e0 = await emergenciaApi(recepcion);
    await doc0.post(`/api/cola/doctor/atender/${e0.idAtencion}`);
    expect((await doc0.put(`/api/atenciones/${e0.idAtencion}/receta`, { data: { lineas: [{ medicamento, presentacion: "elíxir", cantidad_recetada: 1, indicaciones: "5 ml" }] } })).ok()).toBeTruthy();
    await doc0.put(`/api/atenciones/${e0.idAtencion}/consulta`, { data: { tipo_consulta: "primera", motivo_consulta: "x", diagnosticos: [] } });
    // con receta pendiente el cierre es en farmacia: se envía y se entrega y finaliza en un paso
    await doc0.post(`/api/atenciones/${e0.idAtencion}/enviar`, { data: { destino: "farmacia" } });
    const far0 = await apiComo("pfarmacia", "198.51.100.95");
    const s0 = await (await far0.post(`/api/cola/farmacia/atender/${e0.idAtencion}`)).json();
    const r0 = s0.especifico.renglones as { id_receta_detalle: number; cantidad_recetada: number }[];
    expect((await far0.post(`/api/atenciones/${e0.idAtencion}/entregas`, { data: { finalizar: true, lineas: r0.map((r) => ({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: r.cantidad_recetada })) } })).status()).toBe(201);

    const p = await pacienteConAtencion(recepcion, "Berta");
    const signos = await apiComo("psignos", "198.51.100.97");
    const id = (await (await signos.post("/api/cola/signos/llamar-siguiente")).json()).atencion.id_atencion;
    await signos.post(`/api/atenciones/${id}/enviar`, { data: { destino: "doctor" } });
    await ingresarPorPantalla(page, "pdoctor");
    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await page.goto("/doctor");
    await page.getByRole("button", { name: /^Atender a / }).click();
    await expect(page.getByRole("region", { name: "Paciente en atención" })).toContainText(p.codigo);
    await page.getByLabel("Motivo de la consulta").fill("Control");
    await page.getByRole("button", { name: "Guardar consulta" }).click();
    await expect(page.getByText("Consulta guardada.")).toBeVisible();
    await page.getByRole("button", { name: "Agregar medicamento" }).click();
    await page.getByLabel("Medicamento", { exact: true }).fill(medicamento.slice(0, 14));
    await expect(page.locator("#sug-medicamento option")).toHaveCount(1);
    await expect(page.locator(`#sug-medicamento option[value="${medicamento}"]`)).toHaveCount(1);
    await page.getByLabel("Medicamento", { exact: true }).fill(medicamento);
    await page.getByLabel("Presentación").fill("elíxir");
    await page.getByLabel("Cantidad").fill("2");
    await page.getByLabel("Indicaciones").fill("5 ml cada 12 horas");
    await page.getByRole("button", { name: "Guardar receta" }).click();
    await expect(page.getByText("Receta guardada.")).toBeVisible();
    // texto libre: un medicamento nunca visto también se acepta
    await page.getByRole("button", { name: "Agregar medicamento" }).click();
    await page.getByLabel("Medicamento", { exact: true }).nth(1).fill("Preparado de la abuela");
    await page.getByLabel("Presentación").nth(1).fill("té");
    await page.getByLabel("Cantidad").nth(1).fill("1");
    await page.getByRole("button", { name: "Guardar receta" }).click();
    await expect(page.getByText("Escriba las indicaciones")).toBeVisible();
    await page.getByLabel("Indicaciones").nth(1).fill("1 taza al día");
    await page.getByRole("button", { name: "Guardar receta" }).click();
    await expect(page.getByText("Receta guardada.")).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sinDesbordeHorizontal(page);
    await page.screenshot({ path: `/tmp/e2e-resultados/receta-libre-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /Enviar a farmacia/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Enviar a farmacia/i }).click();
    await expect(page.getByText(/pasó a farmacia/i)).toBeVisible();

    // Farmacia: ve lo recetado en texto, entrega con faltante y finaliza
    const far = await apiComo("pfarmacia", "198.51.100.98");
    const s = await (await far.post(`/api/cola/farmacia/atender/${id}`)).json();
    const renglones = s.especifico.renglones as { id_receta_detalle: number; medicamento: string; presentacion: string; cantidad_recetada: number }[];
    expect(renglones.map((r) => r.medicamento)).toEqual([medicamento, "Preparado de la abuela"]);
    const ent = await far.post(`/api/atenciones/${id}/entregas`, { data: { lineas: [
      { id_receta_detalle: renglones[0].id_receta_detalle, cantidad_entregada: 1, observacion: "Solo había una" }, { id_receta_detalle: renglones[1].id_receta_detalle, cantidad_entregada: 1 }] } });
    expect(ent.status()).toBe(201);
    expect((await (await far.post(`/api/atenciones/${id}/enviar`, { data: { destino: "finalizar" } })).json()).estado).toBe("finalizada");
  });
});
