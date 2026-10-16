import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("reportes", () => {
  let m: Montaje; const c: Record<string, string> = {};
  const IP = "198.51.110.1";
  const enGt = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Guatemala" });
  const hoy = enGt(Date.now());
  const manana = enGt(Date.now() + 86400000);
  beforeAll(async () => {
    m = montar(); let i = 2;
    for (const u of ["precepcion", "psignos", "pdoctor", "pnutricion", "pvacunacion", "pfarmacia", "padmin"]) c[u] = (await ingresar(m.app, u, `198.51.110.${i++}`)).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const enviar = (id: number, destino: string, cookie: string) => post(m.app, `/api/atenciones/${id}/enviar`, cookie, { destino }, IP);
  const rep = (tipo: string, extra = "") => get(m.app, `/api/reportes/${tipo}?desde=${hoy}&hasta=${manana}${extra}`, c.padmin, IP);

  it("cada reporte devuelve columnas y filas coherentes con una visita completa", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", c.padmin, {}, IP);
    const p = await crearPaciente(m, c.precepcion); const a = await abrirAtencion(m, c.precepcion, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", c.psignos, {}, IP); await enviar(a.id_atencion, "doctor", c.psignos);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", c.pdoctor, {}, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, c.pdoctor, { tipo_consulta: "primera", motivo_consulta: "Tos", diagnosticos: [{ descripcion_diagnostico: "Bronquitis", codigo_cie10: "J20.9" }] }, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/receta`, c.pdoctor, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 10, indicaciones: "1 al día" }] }, IP);
    await enviar(a.id_atencion, "farmacia", c.pdoctor);
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", c.pfarmacia, {}, IP);
    await post(m.app, `/api/atenciones/${a.id_atencion}/entregas`, c.pfarmacia, { lineas: s.body.especifico.renglones.map((r: { id_receta_detalle: number }) => ({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: 8, observacion: "Faltan" })) }, IP);
    await enviar(a.id_atencion, "finalizar", c.pfarmacia);

    const at = await rep("atenciones");
    expect(at.status).toBe(200);
    expect(at.body.filas.reduce((n: number, f: { total: number }) => n + f.total, 0)).toBeGreaterThanOrEqual(1);
    expect((await rep("atenciones", "&agrupar=month")).body.filas[0].periodo).toMatch(/^\d{2}\/\d{4}$/);
    const pa = (await rep("pacientes-por-area")).body.filas.map((f: { area: string }) => f.area);
    expect(pa).toEqual(expect.arrayContaining(["signos vitales", "doctor", "farmacia"]));
    const te = (await rep("tiempos-espera")).body.filas;
    expect(te.find((f: { area: string }) => f.area === "doctor").atendidos).toBeGreaterThanOrEqual(1);
    expect(te.find((f: { area: string }) => f.area === "doctor").espera_promedio).toBeGreaterThanOrEqual(0);
    const me = (await rep("medicamentos-entregados")).body.filas;
    expect(me.some((f: { entregado: number; no_entregado: number }) => f.entregado >= 8 && f.no_entregado >= 2)).toBe(true);
    const cd = await rep("consultas-diarias");
    expect(cd.body.filas.some((f: { codigo: string; diagnostico: string }) => f.codigo === p.codigo_paciente && f.diagnostico === "Bronquitis (J20.9)")).toBe(true);
    expect(cd.body.provisional).toBe(true);
    expect((await m.dueno.query("SELECT 1 FROM bitacora WHERE accion = 'ver_historial' AND entidad = 'reportes'")).rowCount).toBeGreaterThan(0);
    expect((await rep("vacunas-aplicadas")).status).toBe(200);
    // Corregir la consulta otro día no la cambia de período, y una fecha de nacimiento incoherente no tumba el reporte
    await m.dueno.query("ALTER TABLE consultas DISABLE TRIGGER USER");
    await m.dueno.query("UPDATE consultas SET fecha_creacion = now() + interval '40 days' WHERE id_atencion = $1 AND vigente", [a.id_atencion]);
    await m.dueno.query("ALTER TABLE consultas ENABLE TRIGGER USER");
    await m.dueno.query("ALTER TABLE pacientes DISABLE TRIGGER USER");
    await m.dueno.query("UPDATE pacientes SET fecha_nacimiento = current_date WHERE id_paciente = $1", [p.id_paciente]);
    await m.dueno.query("ALTER TABLE pacientes ENABLE TRIGGER USER");
    const otra = await rep("consultas-diarias");
    expect(otra.status).toBe(200);
    expect(otra.body.filas.some((f: { codigo: string }) => f.codigo === p.codigo_paciente)).toBe(true);
    expect((await m.dueno.query("SHOW timezone")).rows[0].TimeZone).toBe("America/Guatemala");
  });

  it("solo administradores; rangos inválidos o demasiado largos y tipos desconocidos se rechazan", async () => {
    for (const u of Object.keys(c).filter((x) => x !== "padmin")) expect((await get(m.app, `/api/reportes/atenciones?desde=${hoy}&hasta=${hoy}`, c[u], IP)).status).toBe(403);
    expect((await get(m.app, `/api/reportes/atenciones?desde=${manana}&hasta=${hoy}`, c.padmin, IP)).body.error.codigo).toBe("RANGO_INVALIDO");
    expect((await get(m.app, "/api/reportes/atenciones?desde=2020-01-01&hasta=2026-01-01", c.padmin, IP)).body.error.codigo).toBe("RANGO_MUY_LARGO");
    expect((await get(m.app, `/api/reportes/inventado?desde=${hoy}&hasta=${hoy}`, c.padmin, IP)).status).toBe(422);
    expect((await get(m.app, `/api/reportes/atenciones?desde=2026-02-31&hasta=${hoy}`, c.padmin, IP)).status).toBe(422);
    expect((await get(m.app, `/api/reportes/atenciones?desde=${hoy}&hasta=${hoy}&agrupar=year`, c.padmin, IP)).status).toBe(422);
    expect((await get(m.app, "/api/reportes/atenciones", c.padmin, IP)).status).toBe(422);
  });
});
