import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, cuiNuevo, emergencia, get, hayBd, ingresar, montar, patch, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("ajustes de la revisión", () => {
  let m: Montaje; const c: Record<string, string> = {};
  const IP = "198.51.111.1";
  beforeAll(async () => {
    m = montar(); let i = 2;
    for (const u of ["precepcion", "psignos", "pdoctor", "pdoctora", "pnutricion", "padmin"]) c[u] = (await ingresar(m.app, u, `198.51.111.${i++}`)).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const limpiar = () => post(m.app, "/api/administracion/cierre-del-dia", c.padmin, {}, IP);

  it("los nombres y apellidos se guardan con mayúscula inicial (paciente, encargado y emergencia)", async () => {
    const letras = Array.from({ length: 8 }, () => "abcdefghij"[Math.floor(Math.random() * 10)]).join("");
    const r = await post(m.app, "/api/pacientes", c.precepcion, { nombres: "jose  maría", apellidos: `perez ${letras}`, fecha_nacimiento: "1980-03-04", sexo: "M", cui: cuiNuevo() }, IP);
    expect(r.status).toBe(201);
    expect(r.body.paciente.nombres).toBe("Jose María");
    expect(r.body.paciente.apellidos).toBe(`Perez ${letras[0].toUpperCase()}${letras.slice(1)}`);
    const e = await post(m.app, "/api/pacientes/emergencia", c.precepcion, { sexo: "F", edad_aproximada_anios: 30, nombres: "ana", apellidos: "de la cruz" }, IP);
    expect(e.body.paciente.nombres).toBe("Ana"); expect(e.body.paciente.apellidos).toBe("De La Cruz");
    const ed = await patch(m.app, `/api/pacientes/${r.body.paciente.id_paciente}`, c.precepcion, { nombres: "JOSÉ LUIS" }, IP);
    expect(ed.body.paciente.nombres).toBe("José Luis");
  });

  it("editar datos del paciente deja en la bitácora el valor anterior y el nuevo (recepción y administrador)", async () => {
    const p = await crearPaciente(m, c.precepcion);
    for (const [cookie, tel] of [[c.precepcion, "55551111"], [c.padmin, "55552222"]] as const) {
      expect((await patch(m.app, `/api/pacientes/${p.id_paciente}`, cookie, { telefono: tel }, IP)).status).toBe(200);
    }
    const b = await m.dueno.query("SELECT valor_anterior->>'telefono' AS antes, valor_nuevo->>'telefono' AS despues FROM bitacora WHERE entidad = 'pacientes' AND accion = 'editar' AND id_registro = $1 ORDER BY id_bitacora", [p.id_paciente]);
    expect(b.rows.map((x) => [x.antes, x.despues])).toEqual([[null, "55551111"], ["55551111", "55552222"]]);
    expect((await patch(m.app, `/api/pacientes/${p.id_paciente}`, c.pdoctor, { telefono: "55553333" }, IP)).status).toBe(403);
  });

  it("los errores de validación dicen qué campo está mal y por qué", async () => {
    await limpiar();
    const p = await crearPaciente(m, c.precepcion); const a = await abrirAtencion(m, c.precepcion, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", c.psignos, {}, IP);
    const url = `/api/atenciones/${a.id_atencion}/signos`;
    const r = await post(m.app, url, c.psignos, { saturacion_oxigeno: 120, peso_lb: 900 }, IP);
    expect(r.status).toBe(422);
    expect(r.body.error.mensaje).toContain("La saturación debe estar entre 50 y 100");
    const campos = Object.fromEntries(r.body.error.detalles.map((d: { campo: string; mensaje: string }) => [d.campo, d.mensaje]));
    expect(campos.saturacion_oxigeno).toBe("La saturación debe estar entre 50 y 100");
    expect(campos.peso_lb).toBe("El peso debe estar entre 0.7 y 660 libras");
    const q = await post(m.app, "/api/pacientes", c.precepcion, { nombres: "Ana", apellidos: "Pérez", fecha_nacimiento: "1990-02-30", sexo: "F", cui: "123" }, IP);
    const det = Object.fromEntries(q.body.error.detalles.map((d: { campo: string; mensaje: string }) => [d.campo, d.mensaje]));
    expect(det.fecha_nacimiento).toBe("Esa fecha no existe");
    expect(det.cui).toBe("El DPI/CUI debe tener 13 números");
    expect(q.body.error.mensaje).not.toBe("Los datos enviados no son válidos.");
  });

  it("el peso se recibe en libras, se guarda en kilogramos (2 decimales) y se muestra en libras", async () => {
    await limpiar();
    const p = await crearPaciente(m, c.precepcion); const a = await abrirAtencion(m, c.precepcion, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", c.psignos, {}, IP);
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_lb: 150 }, IP);
    expect(r.status).toBe(201); expect(r.body.peso_lb).toBe(150); expect(r.body.peso_kg).toBeUndefined();
    expect(Number((await m.dueno.query("SELECT peso_kg FROM signos_vitales WHERE id_atencion = $1 AND vigente", [a.id_atencion])).rows[0].peso_kg)).toBe(68.04);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_lb: 0.7 }, IP)).status).toBe(201);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_lb: 660 }, IP)).status).toBe(201);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_lb: 0.69 }, IP)).status).toBe(422);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_kg: 60 }, IP)).status).toBe(422);
    const h = await get(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.padmin, IP);
    expect(h.body.datos.every((x: { peso_lb: number | null; peso_kg?: number }) => x.peso_kg === undefined && x.peso_lb !== undefined)).toBe(true);
  });

  it("\"Atender\": toma a un paciente específico de la lista, de forma atómica y con responsable", async () => {
    await limpiar();
    const e1 = await emergencia(m, c.precepcion); const e2 = await emergencia(m, c.precepcion); const e3 = await emergencia(m, c.precepcion);
    // el segundo de la lista, sin pasar por el orden
    const r = await post(m.app, `/api/cola/doctor/atender/${e2.id_atencion}`, c.pdoctor, {}, IP);
    expect(r.status).toBe(200); expect(r.body.atencion.id_atencion).toBe(e2.id_atencion); expect(r.body.atencion.estado).toBe("en_atencion");
    const quien = await m.dueno.query("SELECT u.nombre_usuario FROM recorridos_atencion r JOIN usuarios u USING (id_usuario) WHERE r.id_atencion = $1 AND r.fecha_hora_salida IS NULL", [e2.id_atencion]);
    expect(quien.rows[0].nombre_usuario).toBe("pdoctor");
    const ev = await m.dueno.query("SELECT detalle FROM bitacora WHERE accion = 'atender_directo' AND id_registro = $1", [e2.id_atencion]);
    expect(ev.rowCount).toBe(1); expect(ev.rows[0].detalle).toContain("2 (2 emergencia(s))");
    // otra persona no puede tomar al mismo; y quien ya atiende a alguien no toma otro
    const dup = await post(m.app, `/api/cola/doctor/atender/${e2.id_atencion}`, c.pdoctora, {}, IP);
    expect(dup.status).toBe(409); expect(dup.body.error.codigo).toBe("YA_TOMADA");
    expect((await post(m.app, `/api/cola/doctor/atender/${e3.id_atencion}`, c.pdoctor, {}, IP)).body.error.codigo).toBe("YA_ATIENDE");
    expect((await post(m.app, `/api/cola/doctor/atender/99999999`, c.pdoctora, {}, IP)).body.error.codigo).toBe("NO_ESTA_EN_COLA");
    // otras áreas no atienden en la cola del doctor
    expect((await post(m.app, `/api/cola/doctor/atender/${e1.id_atencion}`, c.pnutricion, {}, IP)).status).toBe(403);
    expect((await post(m.app, `/api/cola/doctor/atender/${e1.id_atencion}`, c.precepcion, {}, IP)).status).toBe(403);
    // el que sigue en el orden sigue siendo el primero de la lista
    const sig = await post(m.app, "/api/cola/doctor/llamar-siguiente", c.pdoctora, {}, IP);
    expect(sig.body.atencion.id_atencion).toBe(e1.id_atencion);
  });

  it("dos personas que aprietan \"Atender\" al mismo paciente: solo una lo toma", async () => {
    await limpiar();
    for (let ronda = 0; ronda < 3; ronda++) {
      const e = await emergencia(m, c.precepcion);
      const resp = await Promise.all([post(m.app, `/api/cola/doctor/atender/${e.id_atencion}`, c.pdoctor, {}, IP), post(m.app, `/api/cola/doctor/atender/${e.id_atencion}`, c.pdoctora, {}, IP)]);
      expect(resp.filter((x) => x.status === 200)).toHaveLength(1);
      expect(resp.filter((x) => x.status !== 200).every((x) => x.status === 409)).toBe(true);
      const libre = resp.find((x) => x.status === 200)!;
      await post(m.app, `/api/atenciones/${libre.body.atencion.id_atencion}/enviar`, c.padmin, { destino: "finalizar" }, IP);
    }
  });

  it("receta en texto libre: se acepta cualquier medicamento y se sugiere lo ya escrito", async () => {
    await limpiar();
    const e = await emergencia(m, c.precepcion);
    await post(m.app, `/api/cola/doctor/atender/${e.id_atencion}`, c.pdoctor, {}, IP);
    const url = `/api/atenciones/${e.id_atencion}/receta`;
    const linea = { medicamento: "Jarabe Casero Único 5 mg/ml", presentacion: "frasco", cantidad_recetada: 2, indicaciones: "5 ml cada 8 horas" };
    const ok = await put(m.app, url, c.pdoctor, { lineas: [linea] }, IP);
    expect(ok.status).toBe(200); expect(ok.body.receta[0]).toMatchObject({ medicamento: "Jarabe Casero Único 5 mg/ml", presentacion: "frasco", cantidad_recetada: 2 });
    expect((await put(m.app, url, c.pdoctor, { lineas: [{ ...linea, medicamento: "  " }] }, IP)).status).toBe(422);
    expect((await put(m.app, url, c.pdoctor, { lineas: [{ ...linea, presentacion: "" }] }, IP)).body.error.detalles[0].campo).toBe("lineas.0.presentacion");
    expect((await put(m.app, url, c.pdoctor, { lineas: [{ ...linea, cantidad_recetada: 1000 }] }, IP)).body.error.mensaje).toContain("La cantidad debe estar entre 1 y 999");
    expect((await put(m.app, url, c.pdoctor, { lineas: [{ ...linea, id_medicamento: 1 }] }, IP)).status).toBe(422);
    const s = await get(m.app, "/api/recetas/sugerencias?campo=medicamento&q=JARABE%20case", c.pdoctor, IP);
    expect(s.body.datos).toContain("Jarabe Casero Único 5 mg/ml");
    expect((await get(m.app, "/api/recetas/sugerencias?campo=presentacion&q=fras", c.pnutricion, IP)).body.datos).toContain("frasco");
    expect((await get(m.app, "/api/recetas/sugerencias?campo=medicamento&q=ja", c.precepcion, IP)).status).toBe(403);
    expect((await get(m.app, "/api/recetas/sugerencias?campo=otro&q=ja", c.pdoctor, IP)).status).toBe(422);
  });
});
