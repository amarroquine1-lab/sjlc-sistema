import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, idUsuarioDe, ingresar, montar, post, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("atención de otra persona: tomar y devolver (Administración)", () => {
  let m: Montaje; let rec: string; let admin: string; let signos: string; let doctor: string;
  const IP = "198.51.108.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.108.2")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.108.3")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.108.4")).cookie!;
    doctor = (await ingresar(m.app, "pdoctor", "198.51.108.5")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  beforeEach(async () => { await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP); });

  const nuevo = async () => abrirAtencion(m, rec, (await crearPaciente(m, rec)).id_paciente);
  const tramo = async (id: number) => (await m.dueno.query("SELECT id_usuario, fecha_hora_inicio FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [id])).rows[0];

  it("la tarjeta trae la hora de inicio y quién atiende", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    const f = (await get(m.app, "/api/cola/signos", admin, IP)).body.en_atencion.find((x: { id_atencion: number }) => x.id_atencion === a.id_atencion);
    expect(f.inicio_hora).toMatch(/^\d{2}:\d{2}$/); expect(f.atiende).toBeTruthy();
  });

  it("Administración toma la atención de otra persona: se reasigna, conserva la hora de inicio y queda en la bitácora", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    const antes = await tramo(a.id_atencion);
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/tomar`, admin, {}, IP);
    expect(r.status).toBe(200); expect(r.body.atencion.id_atencion).toBe(a.id_atencion);
    const despues = await tramo(a.id_atencion);
    expect(despues.id_usuario).toBe(await idUsuarioDe(m.dueno, "padmin")); expect(despues.fecha_hora_inicio).toEqual(antes.fecha_hora_inicio);
    expect((await get(m.app, "/api/cola/signos", admin, IP)).body.mi_atencion.id_atencion).toBe(a.id_atencion);
    expect((await get(m.app, "/api/cola/signos", signos, IP)).body.mi_atencion).toBeNull();
    const ev = await m.dueno.query("SELECT detalle, id_usuario, fecha_hora FROM bitacora WHERE accion = 'tomar_atencion' AND id_registro = $1", [a.id_atencion]);
    expect(ev.rowCount).toBe(1); expect(ev.rows[0].id_usuario).toBe(await idUsuarioDe(m.dueno, "padmin"));
    expect(ev.rows[0].detalle).toContain("signos vitales"); expect(ev.rows[0].detalle).toContain(`usuario ${antes.id_usuario}`);
  });

  it("tomar: solo Administración, solo si otra persona lo atiende y respetando uno por área", async () => {
    const a = await nuevo(); const b = await nuevo();
    // en espera no se toma
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/tomar`, admin, {}, IP)).body.error.codigo).toBe("NO_EN_ATENCION");
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    // un rol operativo no puede
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/tomar`, doctor, {}, IP)).status).toBe(403);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/tomar`, signos, {}, IP)).status).toBe(403);
    // Administración ya atiende a otro en signos: no toma un segundo
    expect((await post(m.app, `/api/cola/signos/atender/${b.id_atencion}`, admin, {}, IP)).status).toBe(200);
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/tomar`, admin, {}, IP);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("YA_ATIENDE");
    expect((await post(m.app, `/api/atenciones/${b.id_atencion}/tomar`, admin, {}, IP)).body.error.codigo).toBe("YA_ES_SUYA");
    expect((await m.dueno.query("SELECT 1 FROM bitacora WHERE accion = 'tomar_atencion' AND id_registro = $1", [a.id_atencion])).rowCount).toBe(0);
  });

  it("Administración devuelve a la cola la atención de otra persona y queda en la bitácora", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, admin, {}, IP);
    expect(r.status).toBe(200);
    expect((await get(m.app, "/api/cola/signos", signos, IP)).body.en_espera.map((x: { id_atencion: number }) => x.id_atencion)).toContain(a.id_atencion);
    const ev = await m.dueno.query("SELECT detalle, id_usuario FROM bitacora WHERE accion = 'devolver_a_cola' AND id_registro = $1", [a.id_atencion]);
    expect(ev.rows[0].id_usuario).toBe(await idUsuarioDe(m.dueno, "padmin"));
    expect(ev.rows[0].detalle).toContain("lo devolvió otra persona");
  });

  it("con datos clínicos ya guardados, Administración tampoco puede devolverla", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, signos, { peso_lb: 130 }, IP);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, admin, {}, IP)).body.error.codigo).toBe("YA_HAY_DATOS");
    // y un operativo de otra área no puede devolver la de signos
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, doctor, {}, IP)).status).toBe(403);
  });
});
