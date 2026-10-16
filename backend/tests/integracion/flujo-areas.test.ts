import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

// Flujo general: signos → doctor/nutrición/vacunación; esas tres se envían entre sí, finalizan o van a farmacia.
describe.skipIf(!hayBd)("flujo entre áreas y vacuna en texto libre", () => {
  let m: Montaje; let rec: string; let signos: string; let admin: string;
  const c: Record<string, string> = {};
  const IP = "198.51.110.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.110.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.110.3")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.110.4")).cookie!;
    c.doctor = (await ingresar(m.app, "pdoctor", "198.51.110.5")).cookie!;
    c.nutricion = (await ingresar(m.app, "pnutricion", "198.51.110.6")).cookie!;
    c.vacunacion = (await ingresar(m.app, "pvacunacion", "198.51.110.7")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guatemala" });
  const enviar = (id: number, destino: string, ck: string) => post(m.app, `/api/atenciones/${id}/enviar`, ck, { destino }, IP);
  const opciones = async (id: number, ck: string) => ((await get(m.app, `/api/atenciones/${id}/panel`, ck, IP)).body.opciones_envio as { destino: string }[]).map((o) => o.destino);

  // Registra lo que cada área exige antes de enviar o finalizar
  async function cumplir(area: string, id: number) {
    if (area === "doctor") await put(m.app, `/api/atenciones/${id}/consulta`, c.doctor, { tipo_consulta: "primera", motivo_consulta: "Control", diagnosticos: [] }, IP);
    if (area === "nutricion") await put(m.app, `/api/atenciones/${id}/evaluacion-nutricional`, c.nutricion, { diagnostico_nutricional: "Estado normal" }, IP);
    if (area === "vacunacion") await post(m.app, `/api/atenciones/${id}/vacunas`, c.vacunacion, { nombre_vacuna: "Vacuna del flujo", numero_dosis: 1, fecha_aplicacion: hoy }, IP);
  }
  async function llegarA(area: string, ck: string) {
    const r = await post(m.app, `/api/cola/${area}/llamar-siguiente`, ck, {}, IP);
    expect(r.status).toBe(200); return r.body.atencion.id_atencion as number;
  }
  // Atención nueva que sale de signos hacia el área indicada
  async function desdeSignos(destino: string) {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    expect((await opciones(a.id_atencion, signos))).toEqual(["doctor", "nutricion", "vacunacion"]);
    expect((await enviar(a.id_atencion, destino, signos)).status).toBe(200);
    return a.id_atencion;
  }

  for (const destino of ["doctor", "nutricion", "vacunacion"]) {
    it(`signos envía a ${destino}`, async () => {
      const id = await desdeSignos(destino);
      expect(await llegarA(destino, c[destino])).toBe(id);
    });
  }

  it("signos no envía a farmacia ni finaliza", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    expect((await enviar(a.id_atencion, "farmacia", signos)).status).toBe(422);
    expect((await enviar(a.id_atencion, "finalizar", signos)).status).toBe(422);
  });

  it("doctor, nutrición y vacunación se envían entre sí (los 6 cruces) y todo queda en el recorrido", async () => {
    const id = await desdeSignos("doctor");
    const orden = ["doctor", "nutricion", "vacunacion", "doctor", "vacunacion", "nutricion", "doctor"];
    expect(await llegarA("doctor", c.doctor)).toBe(id);
    for (let i = 0; i < orden.length - 1; i++) {
      const de = orden[i]; const a = orden[i + 1];
      await cumplir(de, id);
      const o = await opciones(id, c[de]);
      expect(o).toEqual(["doctor", "nutricion", "vacunacion", "farmacia", "finalizar"].filter((x) => x !== de));
      expect((await enviar(id, a, c[de])).status).toBe(200);
      expect(await llegarA(a, c[a])).toBe(id);
    }
    await cumplir("doctor", id);
    expect((await enviar(id, "finalizar", c.doctor)).body.estado).toBe("finalizada");
    // 1 tramo de signos + 7 de las tres áreas, todos con entrada, salida y quién atendió
    const t = await m.dueno.query(
      `SELECT ar.nombre_area, r.fecha_hora_entrada, r.fecha_hora_salida, r.id_usuario FROM recorridos_atencion r JOIN areas ar USING (id_area) WHERE r.id_atencion = $1 ORDER BY r.id_recorrido_atencion`, [id]);
    expect(t.rows.map((x) => x.nombre_area)).toEqual(["signos vitales", "doctor", "nutrición", "vacunación", "doctor", "vacunación", "nutrición", "doctor"]);
    expect(t.rows.every((x) => x.fecha_hora_salida && x.id_usuario)).toBe(true);
    // la bitácora registra los cambios del recorrido
    const b = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE entidad = 'recorridos_atencion'");
    expect(b.rows[0].n).toBeGreaterThan(0);
  });

  for (const area of ["doctor", "nutricion", "vacunacion"]) {
    it(`${area} finaliza la atención sin receta y puede enviar a farmacia solo con receta`, async () => {
      const id = await desdeSignos(area);
      await llegarA(area, c[area]);
      await cumplir(area, id);
      const f = await enviar(id, "farmacia", c[area]);
      expect(f.status).toBe(409); expect(f.body.error.codigo).toBe("RECETA_FALTANTE");
      expect((await enviar(id, "finalizar", c[area])).body.estado).toBe("finalizada");
    });
  }

  it("enviar a otra área no exige registro previo; finalizar sí (consulta, evaluación o vacuna)", async () => {
    // doctor sin consulta → nutrición; nutrición sin evaluación → vacunación; vacunación sin vacuna → doctor
    const id = await desdeSignos("doctor");
    await llegarA("doctor", c.doctor);
    expect((await enviar(id, "finalizar", c.doctor)).body.error.codigo).toBe("CONSULTA_FALTANTE");
    expect((await enviar(id, "nutricion", c.doctor)).status).toBe(200);
    await llegarA("nutricion", c.nutricion);
    expect((await enviar(id, "finalizar", c.nutricion)).body.error.codigo).toBe("EVALUACION_FALTANTE");
    expect((await enviar(id, "vacunacion", c.nutricion)).status).toBe(200);
    await llegarA("vacunacion", c.vacunacion);
    expect((await enviar(id, "finalizar", c.vacunacion)).body.error.codigo).toBe("VACUNA_FALTANTE");
    expect((await enviar(id, "doctor", c.vacunacion)).status).toBe(200);
    await llegarA("doctor", c.doctor);
    // a farmacia sin registro pero sin receta: se rechaza por la receta, no por el registro
    const f = await enviar(id, "farmacia", c.doctor);
    expect(f.status).toBe(409); expect(f.body.error.codigo).toBe("RECETA_FALTANTE");
    // con receta, el doctor envía a farmacia aunque no haya guardado la consulta
    expect((await put(m.app, `/api/atenciones/${id}/receta`, c.doctor, { lineas: [{ medicamento: "Paracetamol 500 mg", presentacion: "tableta", cantidad_recetada: 6, indicaciones: "1 cada 8 horas" }] }, IP)).status).toBe(200);
    expect((await enviar(id, "farmacia", c.doctor)).status).toBe(200);
  });

  it("el motivo del envío es opcional, queda en el recorrido, la cola, el panel y el historial", async () => {
    const id = await desdeSignos("doctor");
    await llegarA("doctor", c.doctor);
    const largo = await post(m.app, `/api/atenciones/${id}/enviar`, c.doctor, { destino: "nutricion", motivo: "x".repeat(201) }, IP);
    expect(largo.status).toBe(422);
    const ok = await post(m.app, `/api/atenciones/${id}/enviar`, c.doctor, { destino: "nutricion", motivo: "  Niño con bajo peso, valorar suplemento  " }, IP);
    expect(ok.status).toBe(200);
    const cola = await get(m.app, "/api/cola/nutricion", c.nutricion, IP);
    expect(cola.body.en_espera.find((x: { id_atencion: number }) => x.id_atencion === id).motivo_envio).toBe("Niño con bajo peso, valorar suplemento");
    await llegarA("nutricion", c.nutricion);
    const panel = await get(m.app, `/api/atenciones/${id}/panel`, c.nutricion, IP);
    expect(panel.body.atencion.motivo_envio).toBe("Niño con bajo peso, valorar suplemento");
    // sin motivo: queda vacío
    expect((await enviar(id, "vacunacion", c.nutricion)).status).toBe(200);
    const t = await m.dueno.query("SELECT motivo_envio FROM recorridos_atencion WHERE id_atencion = $1 ORDER BY id_recorrido_atencion", [id]);
    expect(t.rows.map((x) => x.motivo_envio)).toEqual([null, null, "Niño con bajo peso, valorar suplemento", null]);
    // un motivo en blanco se guarda como vacío; el historial lo muestra
    const p = (await m.dueno.query("SELECT id_paciente FROM atenciones WHERE id_atencion = $1", [id])).rows[0].id_paciente;
    const h = await get(m.app, `/api/pacientes/${p}/historial`, admin, IP);
    expect(h.status).toBe(200);
    expect(JSON.stringify(h.body)).toContain("Niño con bajo peso, valorar suplemento");
  });

  it("vacuna en texto libre: acepta cualquier nombre, sugiere lo escrito y no repite la dosis", async () => {
    const id = await desdeSignos("vacunacion"); await llegarA("vacunacion", c.vacunacion);
    const nueva = (nombre: string, dosis = 1) => post(m.app, `/api/atenciones/${id}/vacunas`, c.vacunacion, { nombre_vacuna: nombre, numero_dosis: dosis, lote: "Z9", fecha_aplicacion: hoy }, IP);
    const ok = await nueva("Vacuna Rarísima Zeta");
    expect(ok.status).toBe(201);
    expect(ok.body.aplicadas.at(-1)).toMatchObject({ nombre_vacuna: "Vacuna Rarísima Zeta", id_vacuna: null });
    expect((await nueva("  vacuna rarisima   zeta ")).body.error.codigo).toBe("DOSIS_YA_REGISTRADA");
    expect((await nueva("Vacuna Rarísima Zeta", 2)).status).toBe(201);
    const s = await get(m.app, "/api/vacunas/sugerencias?q=vacuna rar", c.vacunacion, IP);
    expect(s.body.datos).toContain("Vacuna Rarísima Zeta");
    const cat = await get(m.app, "/api/vacunas/sugerencias?q=pentava", c.vacunacion, IP);
    expect(cat.body.datos).toContain("Pentavalente"); // también sugiere las del catálogo
    // una del catálogo se vincula por su nombre
    const pv = await nueva("pentavalente");
    expect(pv.body.aplicadas.at(-1).id_vacuna).not.toBeNull();
    expect((await get(m.app, "/api/vacunas/sugerencias?q=vac", c.doctor, IP)).status).toBe(403);
  });
});
