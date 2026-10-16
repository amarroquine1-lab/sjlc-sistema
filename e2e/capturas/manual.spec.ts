import { type APIRequestContext, expect, test, type Page } from "@playwright/test";
import { apiComo, cuiAleatorio, ingresarPorPantalla } from "../pruebas/ayudas";

const SALIDA = "/tmp/e2e-resultados/docs-capturas";

// Crea un paciente con nombre realista (ficticio) y le abre la atención del tipo indicado.
async function nuevo(recepcion: APIRequestContext, d: { nombres: string; apellidos: string; nacimiento: string; sexo: "F" | "M"; tipo: number; encargado?: object }) {
  const cuerpo: Record<string, unknown> = { nombres: d.nombres, apellidos: d.apellidos, fecha_nacimiento: d.nacimiento, sexo: d.sexo, id_municipio_residencia: 108, zona_residencia: 10,
    direccion: "3a. avenida 10-25, zona 10, Mixco", telefono: "5500-1122", confirmar_duplicado: true };
  if (d.encargado) { cuerpo.sin_cui = true; cuerpo.encargado = d.encargado; } else cuerpo.cui = cuiAleatorio();
  // Si ya existe (corridas anteriores), se reutiliza: queda con varias visitas en el historial
  const previo = (await (await recepcion.get(`/api/pacientes/buscar?q=${encodeURIComponent(d.apellidos)}`)).json()).datos?.find((x: { nombres: string }) => x.nombres === d.nombres);
  let paciente = previo;
  if (!paciente) {
    const p = await recepcion.post("/api/pacientes", { data: cuerpo });
    expect(p.status(), await p.text()).toBe(201);
    paciente = (await p.json()).paciente;
  }
  const a = await recepcion.post("/api/atenciones", { data: { id_paciente: paciente.id_paciente, id_tipo_atencion: d.tipo } });
  expect(a.status()).toBe(201);
  const at = await a.json();
  return { ...d, idPaciente: paciente.id_paciente as number, codigo: paciente.codigo_paciente as string, idAtencion: at.id_atencion as number, numero: at.numero_atencion as string };
}

test("capturas para los manuales", async ({ page, browser }) => {
  const foto = async (p: Page, nombre: string) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500); await p.screenshot({ path: `${SALIDA}/${nombre}.png`, fullPage: true }); };
  const entrar = async (p: Page, usuario: string) => { await ingresarPorPantalla(p, usuario); await expect(p.getByRole("heading", { name: /^Hola, / })).toBeVisible(); };
  const otra = async (usuario: string) => { const c = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const p = await c.newPage(); await entrar(p, usuario); return { p, c }; };

  const recepcion = await apiComo("precepcion", "198.51.100.140");
  const sg = await apiComo("psignos", "198.51.100.141");
  const elena = await nuevo(recepcion, { nombres: "Elena Beatriz", apellidos: "Marroquín Pérez", nacimiento: "1987-05-21", sexo: "F", tipo: 1 });
  const rosa = await nuevo(recepcion, { nombres: "Rosa Amelia", apellidos: "Tzoc Ixcoy", nacimiento: "2023-08-14", sexo: "F", tipo: 3,
    encargado: { nombres: "Carmen Julia", apellidos: "Ixcoy López", dpi: cuiAleatorio(), parentesco: "madre", telefono: "4455-6677" } });
  const pedro = await nuevo(recepcion, { nombres: "Pedro Andrés", apellidos: "Ajú Cotí", nacimiento: "2025-11-03", sexo: "M", tipo: 2,
    encargado: { nombres: "Lucía Marina", apellidos: "Cotí Rodas", dpi: cuiAleatorio(), parentesco: "madre", telefono: "5566-7788" } });
  const signosApi = async (idAtencion: number, destino: string, s: object) => {
    expect((await sg.post(`/api/cola/signos/atender/${idAtencion}`)).ok()).toBeTruthy();
    expect((await sg.post(`/api/atenciones/${idAtencion}/signos`, { data: s })).ok()).toBeTruthy();
    expect((await sg.post(`/api/atenciones/${idAtencion}/enviar`, { data: { destino } })).ok()).toBeTruthy();
  };

  // Ingreso
  await page.goto("/ingreso"); await foto(page, "01-ingreso");

  // Recepción
  await entrar(page, "precepcion"); await foto(page, "02-inicio-recepcion");
  await page.goto("/recepcion"); await page.getByRole("searchbox").fill("Marroquín Pérez"); await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Paciente seleccionado" })).toContainText(elena.codigo); await foto(page, "03-recepcion-paciente");
  await page.goto("/recepcion/nuevo"); await foto(page, "04-recepcion-nuevo");
  await page.goto("/recepcion/emergencia"); await foto(page, "05-recepcion-emergencia");
  await page.goto(`/recepcion/ticket/${elena.idAtencion}`); await expect(page.getByRole("article", { name: "Ticket de atención" })).toBeVisible(); await foto(page, "06-ticket");

  // Signos
  const S = await otra("psignos");
  await S.p.goto("/signos"); await expect(S.p.getByRole("region", { name: "Cola de espera" })).toBeVisible(); await foto(S.p, "07-signos-cola");
  await S.p.getByRole("button", { name: /^Atender a Elena/ }).click(); await expect(S.p.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await S.p.getByLabel("Peso (libras)").fill("142"); await S.p.getByLabel("Talla (cm)").fill("158"); await S.p.getByLabel("Temperatura (°C)").fill("37.4");
  await S.p.getByLabel("Presión alta").fill("118"); await S.p.getByLabel("Presión baja").fill("76"); await S.p.getByLabel("Pulso (por minuto)").fill("84"); await S.p.getByLabel("Saturación de oxígeno (%)").fill("97");
  await S.p.getByRole("button", { name: "Guardar signos" }).click(); await expect(S.p.getByRole("region", { name: "Paciente en atención" })).toContainText("142 lb"); await foto(S.p, "08-signos-atencion");
  await S.p.getByRole("button", { name: /Enviar a doctor/i }).click(); await expect(S.p.getByRole("alertdialog")).toBeVisible(); await foto(S.p, "09-signos-enviar");
  await S.p.getByRole("alertdialog").getByRole("button", { name: /Enviar a doctor/i }).click(); await expect(S.p.getByText(/pasó a doctor/i)).toBeVisible();
  await S.c.close();

  // Doctor (segunda doctora: el primero ya tiene un paciente en atención en los datos de demostración)
  const D = await otra("pdoctora");
  await D.p.goto("/doctor"); await expect(D.p.getByRole("region", { name: "Cola de espera" })).toBeVisible(); await foto(D.p, "10-doctor-cola");
  await D.p.getByRole("button", { name: /^Atender a Elena/ }).click(); await expect(D.p.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await D.p.getByLabel("Motivo de la consulta").fill("Dolor de cabeza y malestar general desde hace tres días");
  await D.p.getByLabel("Diagnóstico 1").fill("Cefalea tensional"); await D.p.getByLabel("Conducta o tratamiento").fill("Reposo, hidratación y control si no mejora");
  await D.p.getByRole("button", { name: "Guardar consulta" }).click(); await expect(D.p.getByText("Consulta guardada.")).toBeVisible();
  await D.p.getByRole("button", { name: "Agregar medicamento" }).click();
  await D.p.getByLabel("Medicamento", { exact: true }).fill("Acetaminofén 500 mg"); await D.p.getByLabel("Presentación").fill("tableta"); await D.p.getByLabel("Cantidad").fill("20"); await D.p.getByLabel("Indicaciones").fill("1 tableta cada 8 horas por 5 días");
  await D.p.getByRole("button", { name: "Guardar receta" }).click(); await expect(D.p.getByText("Receta guardada.")).toBeVisible(); await foto(D.p, "11-doctor-atencion");
  await D.p.getByRole("button", { name: /Enviar a farmacia/i }).click(); await D.p.getByRole("alertdialog").getByLabel("Motivo (opcional)").fill("Explicar cómo tomar el medicamento"); await foto(D.p, "12-doctor-enviar");
  await D.p.getByRole("alertdialog").getByRole("button", { name: /Enviar a farmacia/i }).click(); await expect(D.p.getByText(/pasó a farmacia/i)).toBeVisible();
  await D.c.close();

  // Farmacia
  const F = await otra("pfarmacia");
  await F.p.goto("/farmacia"); await F.p.getByRole("button", { name: /^Atender a Elena/ }).click(); await expect(F.p.getByRole("region", { name: "Paciente en atención" })).toContainText("Acetaminofén"); await foto(F.p, "13-farmacia-atencion");
  await F.p.getByLabel("Recibe (nombre, opcional)").fill("Elena Marroquín");
  await F.p.getByRole("button", { name: "Entregar y finalizar atención" }).click(); await expect(F.p.getByRole("alertdialog")).toBeVisible(); await foto(F.p, "14-farmacia-confirmar");
  await F.p.getByRole("alertdialog").getByRole("button", { name: "Entregar y finalizar" }).click(); await expect(F.p.getByText(/finalizada/)).toBeVisible();
  await F.c.close();

  // Nutrición y vacunación
  await signosApi(rosa.idAtencion, "nutricion", { peso_lb: 22.5, talla_cm: 82, temperatura_c: 36.6, frecuencia_cardiaca: 112 });
  const N = await otra("pnutricion"); await N.p.goto("/nutricion");
  await N.p.getByRole("button", { name: /^Atender a Rosa/ }).click(); await expect(N.p.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await N.p.getByLabel("Diagnóstico nutricional").fill("Riesgo de desnutrición aguda"); await N.p.getByLabel("Observaciones").fill("Se orienta a la madre sobre alimentación complementaria.");
  await N.p.getByRole("button", { name: "Guardar evaluación" }).click(); await expect(N.p.getByText(/Evaluación guardada|guardada/).first()).toBeVisible(); await foto(N.p, "15-nutricion-atencion"); await N.c.close();
  await signosApi(pedro.idAtencion, "vacunacion", { peso_lb: 14.2, talla_cm: 64, temperatura_c: 36.5, frecuencia_cardiaca: 124 });
  // el usuario de vacunación de demostración ya atiende a otro paciente: se usa el administrador
  const V = await otra("padmin"); await V.p.goto("/vacunacion");
  await V.p.getByRole("button", { name: /^Atender a Pedro/ }).click(); await expect(V.p.getByRole("region", { name: "Paciente en atención" })).toBeVisible();
  await V.p.getByLabel("Vacuna", { exact: true }).fill("Pentavalente"); await V.p.getByLabel("Lote").fill("PV2610-B");
  await V.p.getByRole("button", { name: "Registrar vacuna" }).click(); await expect(V.p.getByText("Vacuna registrada.")).toBeVisible(); await foto(V.p, "16-vacunacion-atencion"); await V.c.close();

  // Administración
  const A = await otra("padmin"); await foto(A.p, "17-inicio-admin");
  await A.p.goto("/administracion/usuarios"); await expect(A.p.getByRole("heading", { name: "Usuarios" })).toBeVisible(); await foto(A.p, "18-usuarios");
  await A.p.goto("/administracion/bitacora"); await expect(A.p.getByRole("heading", { name: "Bitácora" })).toBeVisible(); await foto(A.p, "19-bitacora");
  await A.p.goto("/administracion/colas"); await expect(A.p.getByRole("heading", { name: "Estado de las colas" })).toBeVisible(); await foto(A.p, "20-colas");
  await A.p.goto("/reportes"); await A.p.getByRole("button", { name: "Generar reporte" }).click(); await expect(A.p.getByRole("article", { name: "Reporte" })).toBeVisible(); await foto(A.p, "21-reportes");
  await A.p.goto(`/historial/${elena.idPaciente}`); await expect(A.p.getByText(elena.numero).first()).toBeVisible(); await foto(A.p, "22-historial-paciente");
  await A.c.close();
});
