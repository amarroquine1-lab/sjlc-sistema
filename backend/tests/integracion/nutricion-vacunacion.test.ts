import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("nutrición y vacunación (provisional)", () => {
  let m: Montaje; let rec: string; let signos: string; let docA: string; let admin: string; let nutri: string; let vac: string; let farm: string;
  const IP = "198.51.107.1";
  // Fecha de hoy en Guatemala (la base de datos valida contra su propia fecha, no la UTC)
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guatemala" });
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.107.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.107.3")).cookie!;
    docA = (await ingresar(m.app, "pdoctor", "198.51.107.4")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.107.6")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.107.7")).cookie!;
    vac = (await ingresar(m.app, "pvacunacion", "198.51.107.8")).cookie!;
    farm = (await ingresar(m.app, "pfarmacia", "198.51.107.9")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });

  const limpiar = () => post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
  const enviar = (id: number, destino: string, c: string) => post(m.app, `/api/atenciones/${id}/enviar`, c, { destino }, IP);
  const idTipo = async (n: string) => (await m.dueno.query("SELECT id_tipo_atencion FROM tipos_atencion WHERE nombre_tipo_atencion = $1", [n])).rows[0].id_tipo_atencion as number;
  async function hastaSignosYEnviar(tipo: string, destino: string, pacienteId?: number) {
    const p = pacienteId ? { id_paciente: pacienteId } : await crearPaciente(m, rec);
    const a = await abrirAtencion(m, rec, p.id_paciente, await idTipo(tipo));
    const s = await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    expect(s.body.atencion.id_atencion).toBe(a.id_atencion);
    expect((await enviar(a.id_atencion, destino, signos)).status).toBe(200);
    return { p, a };
  }
  const vacunaId = async () => "Pentavalente"; // la vacuna se escribe en texto libre

  it("vacunación directa sin doctor: signos → vacunación → registro de dosis → finalizar", async () => {
    await limpiar();
    const { a } = await hastaSignosYEnviar("vacunación", "vacunacion");
    const s = await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    expect(s.status).toBe(200);
    expect(s.body.opciones_envio.map((o: { destino: string }) => o.destino)).toEqual(["doctor", "nutricion", "farmacia", "finalizar"]);
    expect((await enviar(a.id_atencion, "finalizar", vac)).body.error.codigo).toBe("VACUNA_FALTANTE");
    const idv = await vacunaId();
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, vac, { nombre_vacuna: idv, numero_dosis: 1, lote: "L-123", fecha_aplicacion: hoy }, IP);
    expect(r.status).toBe(201); expect(r.body.aplicadas).toHaveLength(1);
    expect((await enviar(a.id_atencion, "finalizar", vac)).body.estado).toBe("finalizada");
    const fin = await m.dueno.query("SELECT count(*)::int AS n FROM recorridos_atencion r JOIN areas ar USING (id_area) WHERE id_atencion = $1 AND ar.nombre_area = 'doctor'", [a.id_atencion]);
    expect(fin.rows[0].n).toBe(0);
  });

  it("valida dosis: fuera de esquema, repetida en el paciente, fecha futura; corrige con versión nueva", async () => {
    await limpiar();
    const { p, a } = await hastaSignosYEnviar("vacunación", "vacunacion");
    await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    const idv = await vacunaId();
    const v = (extra: object) => post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, vac, { nombre_vacuna: idv, numero_dosis: 1, fecha_aplicacion: hoy, ...extra }, IP);
    expect((await v({ numero_dosis: 9 })).body.error.codigo).toBe("DOSIS_FUERA_DE_ESQUEMA");
    expect((await v({ fecha_aplicacion: "2999-01-01" })).body.error.codigo).toBe("FECHA_FUTURA");
    expect((await v({ fecha_aplicacion: "2026-02-31" })).status).toBe(422);
    expect((await v({ nombre_vacuna: "   " })).body.error.codigo).toBe("DATOS_INVALIDOS");
    const ok = await v({ lote: "A1" }); expect(ok.status).toBe(201);
    expect((await v({})).body.error.codigo).toBe("DOSIS_YA_REGISTRADA");
    const idAplicada = ok.body.aplicadas[0].id_vacuna_aplicada;
    const c = await put(m.app, `/api/atenciones/${a.id_atencion}/vacunas/${idAplicada}`, vac, { nombre_vacuna: idv, numero_dosis: 1, lote: "A2", fecha_aplicacion: hoy }, IP);
    expect(c.status).toBe(200); expect(c.body.aplicadas).toHaveLength(1); expect(c.body.aplicadas[0].lote).toBe("A2");
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM vacunas_aplicadas WHERE id_atencion = $1", [a.id_atencion])).rows[0].n).toBe(2);
    await enviar(a.id_atencion, "finalizar", vac);
    // en una visita nueva, la dosis 1 ya está en el esquema previo y no se repite
    const a2 = await abrirAtencion(m, rec, p.id_paciente, await idTipo("vacunación"));
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP); await enviar(a2.id_atencion, "vacunacion", signos);
    const s2 = await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    expect((await m.dueno.query("SELECT 1 FROM bitacora WHERE accion = 'ver_historial' AND id_registro = $1", [p.id_paciente])).rowCount).toBeGreaterThan(0);
    expect((await post(m.app, `/api/atenciones/${a2.id_atencion}/vacunas`, vac, { nombre_vacuna: await vacunaId(), numero_dosis: 1, fecha_aplicacion: "1900-01-01" }, IP)).body.error.codigo).toBe("FECHA_ANTES_DE_NACER");
    expect(s2.body.especifico.esquema_previo).toHaveLength(1);
    expect((await post(m.app, `/api/atenciones/${a2.id_atencion}/vacunas`, vac, { nombre_vacuna: idv, numero_dosis: 1, fecha_aplicacion: hoy }, IP)).body.error.codigo).toBe("DOSIS_YA_REGISTRADA");
    expect((await post(m.app, `/api/atenciones/${a2.id_atencion}/vacunas`, vac, { nombre_vacuna: idv, numero_dosis: 2, fecha_aplicacion: hoy }, IP)).status).toBe(201);
  });

  it("permisos de vacunación: solo vacunación (y administrador) registra; solo el administrador cambia el catálogo", async () => {
    await limpiar();
    const { a } = await hastaSignosYEnviar("vacunación", "vacunacion");
    await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    const cuerpo = { nombre_vacuna: await vacunaId(), numero_dosis: 1, fecha_aplicacion: hoy };
    for (const c of [rec, signos, docA, nutri, farm]) expect((await post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, c, cuerpo, IP)).status).toBe(403);
    expect((await get(m.app, "/api/vacunas", docA, IP)).status).toBe(403);
    expect((await post(m.app, "/api/vacunas", vac, { nombre_vacuna: "Prueba" }, IP)).status).toBe(403);
    expect((await post(m.app, "/api/vacunas", admin, { nombre_vacuna: " pentavalente " }, IP)).status).toBe(409);
    const hecha = await post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, vac, cuerpo, IP);
    const idv = hecha.body.aplicadas[0].id_vacuna_aplicada;
    for (const c of [rec, signos, docA, nutri, farm]) expect((await put(m.app, `/api/atenciones/${a.id_atencion}/vacunas/${idv}`, c, cuerpo, IP)).status).toBe(403);
    expect((await put(m.app, `/api/atenciones/${a.id_atencion + 100000}/vacunas/${idv}`, vac, cuerpo, IP)).status).toBeGreaterThanOrEqual(403);
    expect((await put(m.app, `/api/atenciones/${a.id_atencion}/vacunas/${100000000}`, vac, cuerpo, IP)).status).toBe(404);
    const { default: st0 } = await import("supertest");
    expect((await st0(m.app).patch("/api/vacunas/1").set("X-Forwarded-For", IP).set("Cookie", vac).send({ activo: false })).status).toBe(403);
    const n = await post(m.app, "/api/vacunas", admin, { nombre_vacuna: "Vacuna de prueba 15", dosis_totales: 2 }, IP);
    expect(n.status).toBe(201);
    const { default: st } = await import("supertest");
    expect((await st(m.app).patch(`/api/vacunas/${n.body.id_vacuna}`).set("X-Forwarded-For", IP).set("Cookie", admin).send({ activo: false })).body.activo).toBe(false);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, admin, { ...cuerpo, nombre_vacuna: "Vacuna de prueba 15" }, IP)).status).toBe(201); // texto libre: acepta cualquier nombre
  });

  it("nutrición: evaluación obligatoria, corrección versionada, receta de suplementos y paso a farmacia", async () => {
    await limpiar();
    const { a } = await hastaSignosYEnviar("nutrición directa", "nutricion");
    const s = await post(m.app, "/api/cola/nutricion/llamar-siguiente", nutri, {}, IP);
    expect(s.status).toBe(200);
    expect((await enviar(a.id_atencion, "finalizar", nutri)).body.error.codigo).toBe("EVALUACION_FALTANTE");
    const ev = { diagnostico_nutricional: "Desnutrición aguda moderada", codigo_cie10: "e44.0", observaciones: "Control en un mes" };
    expect((await put(m.app, `/api/atenciones/${a.id_atencion}/evaluacion-nutricional`, nutri, { ...ev, codigo_cie10: "ZZ" }, IP)).status).toBe(422);
    const r = await put(m.app, `/api/atenciones/${a.id_atencion}/evaluacion-nutricional`, nutri, ev, IP);
    expect(r.status).toBe(200); expect(r.body.evaluacion.codigo_cie10).toBe("E44.0");
    const r2 = await put(m.app, `/api/atenciones/${a.id_atencion}/evaluacion-nutricional`, nutri, { ...ev, observaciones: "Control en 15 días" }, IP);
    expect(r2.body.evaluacion.observaciones).toBe("Control en 15 días");
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM evaluaciones_nutricionales WHERE id_atencion = $1", [a.id_atencion])).rows[0].n).toBe(2);
    expect((await put(m.app, `/api/atenciones/${a.id_atencion}/receta`, nutri, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 30, indicaciones: "1 al día" }] }, IP)).status).toBe(200);
    for (const c of [rec, signos, docA, vac, farm]) expect((await put(m.app, `/api/atenciones/${a.id_atencion}/evaluacion-nutricional`, c, ev, IP)).status).toBe(403);
    expect((await enviar(a.id_atencion, "farmacia", nutri)).status).toBe(200);
  });

  it("el niño enviado por el doctor llega a vacunación y su registro queda ligado a la misma atención", async () => {
    await limpiar();
    const { a } = await hastaSignosYEnviar("consulta general", "doctor");
    await post(m.app, "/api/cola/doctor/llamar-siguiente", docA, {}, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, docA, { tipo_consulta: "control", motivo_consulta: "Control del niño", diagnosticos: [] }, IP);
    expect((await enviar(a.id_atencion, "vacunacion", docA)).status).toBe(200);
    const s = await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    expect(s.body.atencion.id_atencion).toBe(a.id_atencion);
    expect(s.body.clinico).toBeNull(); // vacunación no recibe la consulta ni la receta
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/vacunas`, vac, { nombre_vacuna: await vacunaId(), numero_dosis: 1, fecha_aplicacion: hoy }, IP)).status).toBe(201);
    expect((await enviar(a.id_atencion, "finalizar", vac)).body.estado).toBe("finalizada");
  });
});
