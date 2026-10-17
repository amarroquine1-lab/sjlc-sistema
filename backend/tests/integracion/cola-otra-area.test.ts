import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mensajeYaAtiende } from "../../src/modulos/cola/servicio.js";
import { abrirAtencion, crearPaciente, emergencia, get, hayBd, idUsuarioDe, ingresar, montar, post, type Montaje } from "./ayudas.js";

describe("mensaje de 'ya atiende'", () => {
  it("nombra al paciente, el número de atención y el área", () => {
    expect(mensajeYaAtiende({ numero_atencion: "A-000031", nombre_area: "doctor", paciente: "Pedro F." }))
      .toBe("Ya tiene a Pedro F. (A-000031) en atención en Doctor. Termine con él antes de llamar a otro.");
  });
});

describe.skipIf(!hayBd)("regla de atención por rol", () => {
  let m: Montaje; let rec: string; let admin: string; let signos: string; let doctora: string;
  const IP = "198.51.106.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.106.2")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.106.3")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.106.4")).cookie!;
    doctora = (await ingresar(m.app, "pdoctora", "198.51.106.5")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  beforeEach(async () => { await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP); });

  it("administración tiene un paciente por área a la vez, nunca dos en la misma", async () => {
    const p1 = await crearPaciente(m, rec); const a1 = await abrirAtencion(m, rec, p1.id_paciente);
    const p2 = await crearPaciente(m, rec); const a2 = await abrirAtencion(m, rec, p2.id_paciente);
    const e = await emergencia(m, rec);
    // Toma a uno en signos y a la emergencia en doctor, los dos abiertos a la vez
    expect((await post(m.app, `/api/cola/signos/atender/${a1.id_atencion}`, admin, {}, IP)).status).toBe(200);
    expect((await post(m.app, "/api/cola/doctor/llamar-siguiente", admin, {}, IP)).body.atencion.id_atencion).toBe(e.id_atencion);
    // Cada panel muestra lo que tiene en esa área, sin avisos de otra área
    const cs = (await get(m.app, "/api/cola/signos", admin, IP)).body;
    expect(cs.mi_atencion.id_atencion).toBe(a1.id_atencion); expect(cs.mi_atencion_otra_area).toBeNull();
    const cd = (await get(m.app, "/api/cola/doctor", admin, IP)).body;
    expect(cd.mi_atencion.id_atencion).toBe(e.id_atencion); expect(cd.mi_atencion_otra_area).toBeNull();
    // En signos ya tiene uno: no toma otro
    for (const r of [await post(m.app, "/api/cola/signos/llamar-siguiente", admin, {}, IP), await post(m.app, `/api/cola/signos/atender/${a2.id_atencion}`, admin, {}, IP)]) {
      expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("YA_ATIENDE");
      expect(r.body.error.mensaje).toContain(`(${a1.numero_atencion}) en atención en Signos vitales`);
    }
  });

  it("un rol operativo con un paciente abierto en otra área queda bloqueado y el mensaje dice cuál", async () => {
    const e = await emergencia(m, rec);
    expect((await post(m.app, "/api/cola/doctor/llamar-siguiente", doctora, {}, IP)).status).toBe(200);
    // Caso raro: el tramo abierto de la doctora figura a nombre de quien trabaja en signos (por ejemplo, tras un cambio de área)
    await m.dueno.query("UPDATE recorridos_atencion SET id_usuario = $1 WHERE id_atencion = $2 AND fecha_hora_salida IS NULL", [await idUsuarioDe(m.dueno, "psignos"), e.id_atencion]);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    const num = (await m.dueno.query("SELECT numero_atencion FROM atenciones WHERE id_atencion = $1", [e.id_atencion])).rows[0].numero_atencion;

    const cola = (await get(m.app, "/api/cola/signos", signos, IP)).body;
    expect(cola.mi_atencion).toBeNull();
    expect(cola.mi_atencion_otra_area).toMatchObject({ numero_atencion: num, area: "Doctor", clave: "doctor" });
    for (const r of [await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP), await post(m.app, `/api/cola/signos/atender/${a.id_atencion}`, signos, {}, IP)]) {
      expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("YA_ATIENDE");
      expect(r.body.error.mensaje).toContain(`(${num}) en atención en Doctor`);
    }
    // Quien no tiene nada abierto no ve el aviso
    expect((await get(m.app, "/api/cola/doctor", doctora, IP)).body.mi_atencion_otra_area).toBeNull();
  });

  it("la base de datos también rechaza a un operativo con dos pacientes en áreas distintas", async () => {
    const id = await idUsuarioDe(m.dueno, "psignos");
    const a = await abrirAtencion(m, rec, (await crearPaciente(m, rec)).id_paciente); const b = await emergencia(m, rec);
    await m.dueno.query("UPDATE recorridos_atencion SET fecha_hora_inicio = now(), id_usuario = $1 WHERE id_atencion = $2 AND fecha_hora_salida IS NULL", [id, a.id_atencion]);
    await expect(m.dueno.query("UPDATE recorridos_atencion SET fecha_hora_inicio = now(), id_usuario = $1 WHERE id_atencion = $2 AND fecha_hora_salida IS NULL", [id, b.id_atencion]))
      .rejects.toMatchObject({ constraint: "ux_recorridos_operativo_un_paciente" });
  });
});
