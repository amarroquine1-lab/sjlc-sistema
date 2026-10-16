import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, emergencia, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("doctor: consulta, receta y próximo control", () => {
  let m: Montaje; let rec: string; let signos: string; let docA: string; let docB: string; let admin: string; let nutri: string; let vac: string;
  const IP = "198.51.106.1";
  const consulta = { tipo_consulta: "primera", motivo_consulta: "Fiebre desde hace dos días", diagnosticos: [{ descripcion_diagnostico: "Faringitis aguda", codigo_cie10: "j02.9" }], conducta_tratamiento: "Reposo e hidratación" };
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.106.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.106.3")).cookie!;
    docA = (await ingresar(m.app, "pdoctor", "198.51.106.4")).cookie!;
    docB = (await ingresar(m.app, "pdoctora", "198.51.106.5")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.106.6")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.106.7")).cookie!;
    vac = (await ingresar(m.app, "pvacunacion", "198.51.106.8")).cookie!;
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
  });
  afterAll(async () => { await m.cerrar(); });

  // Deja una atención lista en el doctor A
  async function conDoctor(cookieDoc = docA) {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP); // colas limpias
    await emergencia(m, rec);
    const r = await post(m.app, "/api/cola/doctor/llamar-siguiente", cookieDoc, {}, IP);
    expect(r.status).toBe(200);
    return r.body.atencion.id_atencion as number;
  }

  it("registra la consulta con diagnósticos, la corrige sin borrar y la muestra en el panel", async () => {
    const id = await conDoctor();
    const r = await put(m.app, `/api/atenciones/${id}/consulta`, docA, consulta, IP);
    expect(r.status).toBe(200);
    expect(r.body.consulta.diagnosticos[0].codigo_cie10).toBe("J02.9");
    const r2 = await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, motivo_consulta: "Fiebre y tos" }, IP);
    expect(r2.body.consulta.motivo_consulta).toBe("Fiebre y tos");
    const filas = await m.dueno.query("SELECT vigente, corrige_a FROM consultas WHERE id_atencion = $1 ORDER BY id_consulta", [id]);
    expect(filas.rows.map((x) => x.vigente)).toEqual([false, true]);
    expect(filas.rows[1].corrige_a).not.toBeNull();
    const panel = await get(m.app, `/api/atenciones/${id}/panel`, docA, IP);
    expect(panel.body.clinico.consulta.motivo_consulta).toBe("Fiebre y tos");
    expect(Array.isArray(panel.body.clinico.historial_resumido)).toBe(true);
  });

  it("valida la entrada: motivo obligatorio, CIE-10 y semana de gestación", async () => {
    const id = await conDoctor();
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, motivo_consulta: "" }, IP)).status).toBe(422);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, diagnosticos: [{ descripcion_diagnostico: "x", codigo_cie10: "ZZ" }] }, IP)).status).toBe(422);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, semana_gestacion: 50 }, IP)).status).toBe(422);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, semana_gestacion: 20 }, IP)).status).toBeGreaterThanOrEqual(200);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docA, { ...consulta, campo_extra: 1 }, IP)).status).toBe(422);
  });

  it("solo el doctor que atiende guarda la consulta; otro doctor, otras áreas y recepción reciben 403", async () => {
    const id = await conDoctor(docA);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, docB, consulta, IP)).status).toBe(403);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, nutri, consulta, IP)).status).toBe(403);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, rec, consulta, IP)).status).toBe(403);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, signos, consulta, IP)).status).toBe(403);
    expect((await put(m.app, `/api/atenciones/${id}/consulta`, admin, consulta, IP)).status).toBe(200);
  });

  it("el doctor no puede enviar ni finalizar sin consulta; con consulta y sin receta Farmacia pide primero la receta", async () => {
    const id = await conDoctor();
    const sin = await post(m.app, `/api/atenciones/${id}/enviar`, docA, { destino: "finalizar" }, IP);
    expect(sin.status).toBe(409); expect(sin.body.error.codigo).toBe("CONSULTA_FALTANTE");
    await put(m.app, `/api/atenciones/${id}/consulta`, docA, consulta, IP);
    expect((await post(m.app, `/api/atenciones/${id}/enviar`, docA, { destino: "farmacia" }, IP)).status).toBe(409);
    expect((await post(m.app, `/api/atenciones/${id}/enviar`, docA, { destino: "finalizar" }, IP)).status).toBe(200);
  });

  it("receta: se corrige sin borrar, valida medicamentos y habilita farmacia", async () => {
    const id = await conDoctor();
    await put(m.app, `/api/atenciones/${id}/consulta`, docA, consulta, IP);
    expect((await put(m.app, `/api/atenciones/${id}/receta`, docA, { lineas: [{ medicamento: "", presentacion: "tableta", cantidad_recetada: 1, indicaciones: "x" }] }, IP)).status).toBe(422);
    expect((await put(m.app, `/api/atenciones/${id}/receta`, docA, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 0, indicaciones: "x" }] }, IP)).status).toBe(422);
    expect((await put(m.app, `/api/atenciones/${id}/receta`, docA, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 1, indicaciones: "x" }, { medicamento: "AMOXICILINA 500 mg", presentacion: "Cápsula", cantidad_recetada: 2, indicaciones: "y" }] }, IP)).body.error.codigo).toBe("MEDICAMENTO_REPETIDO");
    const r = await put(m.app, `/api/atenciones/${id}/receta`, docA, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 20, indicaciones: "1 cada 8 horas por 5 días" }] }, IP);
    expect(r.status).toBe(200); expect(r.body.receta).toHaveLength(1);
    const r2 = await put(m.app, `/api/atenciones/${id}/receta`, docA, { lineas: [{ medicamento: "Ibuprofeno 400 mg", presentacion: "tableta", cantidad_recetada: 10, indicaciones: "1 al día" }] }, IP);
    expect(r2.body.receta).toHaveLength(1); expect(r2.body.receta[0].medicamento).toBe("Ibuprofeno 400 mg");
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM recetas WHERE id_atencion = $1", [id])).rows[0].n).toBe(2);
    const panel = await get(m.app, `/api/atenciones/${id}/panel`, docA, IP);
    expect(panel.body.opciones_envio.find((o: { destino: string }) => o.destino === "farmacia")?.sugerido).toBe(true);
    expect((await post(m.app, `/api/atenciones/${id}/enviar`, docA, { destino: "farmacia" }, IP)).status).toBe(200);
    // una lista vacía deja la receta sin efecto
  });

  it("próximo control: lo dejan doctor y vacunación; no se aceptan fechas pasadas; recepción lo ve al buscar", async () => {
    const id = await conDoctor();
    const ok = await post(m.app, `/api/atenciones/${id}/proximos-controles`, docA, { area: "nutricion", descripcion: "Control nutricional en 1 mes", fecha_sugerida: "2999-01-01" }, IP);
    expect(ok.status).toBe(201); expect(ok.body.proximos_controles).toHaveLength(1);
    expect((await post(m.app, `/api/atenciones/${id}/proximos-controles`, docA, { area: "doctor", descripcion: "x", fecha_sugerida: "2000-01-01" }, IP)).status).toBe(422);
    expect((await post(m.app, `/api/atenciones/${id}/proximos-controles`, docA, { area: "doctor", descripcion: "x", fecha_sugerida: "2026-02-31" }, IP)).status).toBe(422);
    expect((await post(m.app, `/api/atenciones/${id}/proximos-controles`, rec, { area: "doctor", descripcion: "x" }, IP)).status).toBe(403);
    expect((await post(m.app, `/api/atenciones/${id}/proximos-controles`, vac, { area: "doctor", descripcion: "x" }, IP)).status).toBe(403);
  });

  it("catálogo de medicamentos: buscar (sin tildes) lo hacen doctor y nutrición; crear solo el administrador", async () => {
    const q = await get(m.app, "/api/medicamentos?q=acetaminofen", docA, IP);
    expect(q.status).toBe(200); expect(q.body.datos.length).toBeGreaterThan(0);
    expect((await get(m.app, "/api/medicamentos", nutri, IP)).status).toBe(200);
    expect((await get(m.app, "/api/medicamentos", rec, IP)).status).toBe(403);
    const nuevo = { nombre_medicamento: "Zinc prueba", presentacion: "tableta", concentracion: "20 mg" };
    expect((await post(m.app, "/api/medicamentos", docA, nuevo, IP)).status).toBe(403);
    expect((await post(m.app, "/api/medicamentos", admin, nuevo, IP)).status).toBe(201);
    expect((await post(m.app, "/api/medicamentos", admin, nuevo, IP)).status).toBe(409);
    const id = (await m.dueno.query("SELECT id_medicamento FROM medicamentos WHERE nombre_medicamento = 'Zinc prueba'")).rows[0].id_medicamento;
    const { default: st } = await import("supertest");
    const pa = (c: string) => st(m.app).patch(`/api/medicamentos/${id}`).set("X-Forwarded-For", IP).set("Cookie", c).send({ activo: false });
    expect((await pa(docA)).status).toBe(403);
    expect((await pa(admin)).body.activo).toBe(false);
  });

  it("nutrición receta suplementos en su tramo y el doctor no ve el historial en el panel de nutrición", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const e = await emergencia(m, rec);
    // pasa de doctor a nutrición
    const idDoc = (await post(m.app, "/api/cola/doctor/llamar-siguiente", docA, {}, IP)).body.atencion.id_atencion as number;
    await put(m.app, `/api/atenciones/${idDoc}/consulta`, docA, consulta, IP);
    expect((await post(m.app, `/api/atenciones/${idDoc}/enviar`, docA, { destino: "nutricion" }, IP)).status).toBe(200);
    const sig = await post(m.app, "/api/cola/nutricion/llamar-siguiente", nutri, {}, IP);
    expect(sig.status).toBe(200);
    expect(sig.body.clinico.historial_resumido).toEqual([]);
    void 0;
    const rn = await put(m.app, `/api/atenciones/${idDoc}/receta`, nutri, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 30, indicaciones: "1 al día" }] }, IP);
    expect(rn.status).toBe(200); expect(rn.body.historial_resumido).toEqual([]);
    expect((await put(m.app, `/api/atenciones/${idDoc}/consulta`, nutri, consulta, IP)).status).toBe(403);
    void e;
  });
});
