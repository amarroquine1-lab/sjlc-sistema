import { expect, test, type Page } from "@playwright/test";
import { apiAdmin, apiComo, cerrarDia, emergenciaApi, ingresarPorPantalla, pacienteConAtencion } from "../pruebas/ayudas";

const CARPETA = process.env.CAPTURAS ?? "antes";

test("capturas de todas las pantallas", async ({ page, browser }, info) => {
  test.setTimeout(420000);
  const proyecto = info.project.name;
  const foto = async (p: Page, nombre: string) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400); await p.screenshot({ path: `/tmp/e2e-resultados/capturas/${CARPETA}/${nombre}-${proyecto}.png`, fullPage: true, style: ".barra, .cabecera-paciente, .barra-envio { position: static !important; }" }); };
  const vista = async (p: Page, nombre: string) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300); await p.screenshot({ path: `/tmp/e2e-resultados/capturas/${CARPETA}/${nombre}-${proyecto}.png` }); };
  const entrar = async (p: Page, usuario: string) => { await ingresarPorPantalla(p, usuario); await expect(p.getByRole("heading", { name: /^Hola, / })).toBeVisible(); };

  // Ingreso
  await page.goto("/ingreso"); await foto(page, "01-ingreso");

  // Datos de ejemplo
  const admin = await apiAdmin(); await cerrarDia(admin);
  const recepcion = await apiComo("precepcion");
  const p1 = await pacienteConAtencion(recepcion, "Marisol"); const p2 = await pacienteConAtencion(recepcion, "Carlos"); const p3 = await pacienteConAtencion(recepcion, "Elena");
  await emergenciaApi(recepcion);

  // Recepción
  await entrar(page, "precepcion"); await foto(page, "02-inicio-recepcion");
  await page.goto("/recepcion"); await foto(page, "03-recepcion-vacia");
  await page.getByRole("searchbox").fill(p1.apellidos); await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Paciente seleccionado" })).toContainText(p1.codigo); await foto(page, "04-recepcion-paciente");
  await page.goto("/recepcion/nuevo"); await foto(page, "05-recepcion-nuevo");
  await page.goto("/recepcion/emergencia"); await foto(page, "06-recepcion-emergencia");
  await page.goto(`/recepcion/ticket/${p1.idAtencion}`); await expect(page.getByRole("article", { name: "Ticket de atención" })).toBeVisible(); await foto(page, "07-ticket");

  // Signos
  const ctxS = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const s = await ctxS.newPage(); await entrar(s, "psignos");
  await s.goto("/signos"); await foto(s, "08-signos-cola");
  await s.getByRole("button", { name: "Llamar siguiente" }).click(); await expect(s.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await s.getByLabel("Saturación de oxígeno (%)").fill("120"); await s.getByRole("button", { name: "Guardar signos" }).click(); await foto(s, "09-signos-atencion-errores");
  await s.getByLabel("Saturación de oxígeno (%)").fill("97"); await s.getByLabel("Peso (libras)").fill("150"); await s.getByLabel("Talla (cm)").fill("160"); await s.getByLabel("Temperatura (°C)").fill("36.8");
  await s.getByLabel("Presión alta").fill("120"); await s.getByLabel("Presión baja").fill("80"); await s.getByLabel("Pulso (por minuto)").fill("72");
  await s.getByRole("button", { name: "Guardar signos" }).click(); await expect(s.getByRole("region", { name: "Paciente en atención" })).toContainText("150 lb"); await foto(s, "10-signos-atencion"); await vista(s, "10b-signos-vista");
  await s.getByRole("button", { name: /Enviar a doctor/i }).click(); await foto(s, "11-dialogo-enviar");
  await s.getByRole("alertdialog").getByRole("button", { name: /Enviar a doctor/i }).click(); await expect(s.getByText(/pasó a doctor/i)).toBeVisible();
  await s.goto("/signos"); await expect(s.getByRole("region", { name: "Cola de espera" })).toBeVisible();
  await s.getByRole("button", { name: "Llamar siguiente" }).click(); await s.getByRole("button", { name: "Guardar signos" }).waitFor();
  await s.getByLabel("Peso (libras)").fill("180"); await s.getByLabel("Talla (cm)").fill("170"); await s.getByRole("button", { name: "Guardar signos" }).click();
  await s.getByRole("button", { name: /Enviar a doctor/i }).click(); await s.getByRole("alertdialog").getByRole("button", { name: /Enviar a doctor/i }).click();
  await ctxS.close();

  // Doctor
  const ctxD = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const d = await ctxD.newPage(); await entrar(d, "pdoctor");
  await d.goto("/doctor"); await foto(d, "12-doctor-cola");
  await d.getByRole("button", { name: /^Atender a / }).first().click(); await expect(d.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await d.getByLabel("Motivo de la consulta").fill("Dolor de cabeza desde hace tres días");
  await d.getByLabel("Diagnóstico 1").fill("Cefalea tensional"); await d.getByLabel("Conducta o tratamiento").fill("Reposo e hidratación");
  await d.getByRole("button", { name: "Guardar consulta" }).click(); await expect(d.getByText("Consulta guardada.")).toBeVisible();
  await d.getByRole("button", { name: "Agregar medicamento" }).click();
  await d.getByLabel("Medicamento", { exact: true }).fill("Acetaminofén 500 mg"); await d.getByLabel("Presentación").fill("tableta"); await d.getByLabel("Cantidad").fill("20"); await d.getByLabel("Indicaciones").fill("1 cada 8 horas por 3 días");
  await d.getByRole("button", { name: "Guardar receta" }).click(); await expect(d.getByText("Receta guardada.")).toBeVisible();
  await foto(d, "13-doctor-atencion"); await vista(d, "13b-doctor-vista"); await d.evaluate(() => window.scrollBy(0, 700)); await d.waitForTimeout(300); await d.screenshot({ path: `/tmp/e2e-resultados/capturas/${CARPETA}/13c-doctor-vista-desplazada-${proyecto}.png` });
  await d.getByRole("button", { name: /Enviar a farmacia/i }).click(); await d.getByRole("alertdialog").getByRole("button", { name: /Enviar a farmacia/i }).click(); await expect(d.getByText(/pasó a farmacia/i)).toBeVisible();
  await ctxD.close();

  // Farmacia
  const ctxF = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const f = await ctxF.newPage(); await entrar(f, "pfarmacia");
  await f.goto("/farmacia"); await foto(f, "14-farmacia-cola");
  await f.getByRole("button", { name: /^Atender a / }).first().click(); await expect(f.getByRole("region", { name: "Paciente en atención" })).toBeVisible(); await foto(f, "15-farmacia-atencion");
  await ctxF.close();

  // Nutrición y vacunación (atenciones de esos tipos)
  const sg = await apiComo("psignos", "198.51.100.120");
  const pn = await pacienteConAtencion(recepcion, "Rosa", 3); const pv = await pacienteConAtencion(recepcion, "Pedro", 2);
  for (const [dest, pac] of [["nutricion", pn], ["vacunacion", pv]] as const) { const id = (await (await sg.post(`/api/cola/signos/atender/${pac.idAtencion}`)).json()).atencion.id_atencion; await sg.post(`/api/atenciones/${id}/enviar`, { data: { destino: dest } }); }
  const ctxN = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const n = await ctxN.newPage(); await entrar(n, "pnutricion"); await n.goto("/nutricion");
  await n.getByRole("button", { name: /^Atender a / }).first().click(); await expect(n.getByRole("region", { name: "Paciente en atención" })).toBeVisible(); await foto(n, "16-nutricion-atencion"); await ctxN.close();
  const ctxV = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const v = await ctxV.newPage(); await entrar(v, "pvacunacion"); await v.goto("/vacunacion");
  await v.getByRole("button", { name: /^Atender a / }).first().click(); await expect(v.getByRole("region", { name: "Paciente en atención" })).toBeVisible(); await foto(v, "17-vacunacion-atencion"); await ctxV.close();
  void pn; void pv; void p2; void p3;

  // Administración
  const ctxA = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const a = await ctxA.newPage(); await entrar(a, "padmin"); await foto(a, "18-inicio-admin");
  await a.goto("/administracion/usuarios"); await expect(a.getByRole("heading", { name: "Usuarios" })).toBeVisible(); await foto(a, "19-usuarios");
  await a.goto("/administracion/bitacora"); await expect(a.getByRole("heading", { name: "Bitácora" })).toBeVisible(); await foto(a, "20-bitacora");
  await a.goto("/administracion/colas"); await expect(a.getByRole("heading", { name: "Estado de las colas" })).toBeVisible(); await foto(a, "21-colas-admin");
  await a.goto("/reportes"); await a.getByRole("button", { name: "Generar reporte" }).click(); await expect(a.getByRole("article", { name: "Reporte" })).toBeVisible(); await foto(a, "22-reportes");
  await a.goto("/historial"); await foto(a, "23-historial-buscar");
  await ctxA.close();
});
