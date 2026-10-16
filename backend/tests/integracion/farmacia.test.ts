import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("farmacia: entrega de medicamentos (provisional)", () => {
  let m: Montaje; let rec: string; let signos: string; let docA: string; let admin: string; let nutri: string; let vac: string; let farm: string;
  const IP = "198.51.108.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.108.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.108.3")).cookie!;
    docA = (await ingresar(m.app, "pdoctor", "198.51.108.4")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.108.6")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.108.7")).cookie!;
    vac = (await ingresar(m.app, "pvacunacion", "198.51.108.8")).cookie!;
    farm = (await ingresar(m.app, "pfarmacia", "198.51.108.9")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const enviar = (id: number, destino: string, c: string) => post(m.app, `/api/atenciones/${id}/enviar`, c, { destino }, IP);

  // Deja una atención en farmacia con dos medicamentos recetados por el doctor
  async function enFarmacia() {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP); await enviar(a.id_atencion, "doctor", signos);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", docA, {}, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, docA, { tipo_consulta: "primera", motivo_consulta: "Dolor", diagnosticos: [] }, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/receta`, docA, { lineas: [
      { medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 20, indicaciones: "1 cada 8 horas" }, { medicamento: "Ibuprofeno 400 mg", presentacion: "tableta", cantidad_recetada: 10, indicaciones: "1 al día" }] }, IP);
    expect((await enviar(a.id_atencion, "farmacia", docA)).status).toBe(200);
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", farm, {}, IP);
    expect(s.status).toBe(200);
    return { a, renglones: s.body.especifico.renglones as { id_receta_detalle: number; cantidad_recetada: number }[] };
  }

  it("la cola de farmacia solo recibe pacientes con receta y muestra los renglones", async () => {
    const { a: a0, renglones } = await enFarmacia();
    expect(renglones).toHaveLength(2);
    const panel = (await get(m.app, `/api/atenciones/${a0.id_atencion}/panel`, farm, IP)).body;
    expect(panel.signos).toBeNull();
    expect(panel.paciente).toMatchObject({ direccion: null, telefono: null, encargados: [] });
    expect(renglones[0]).toMatchObject({ receta_de: "doctor", numero_orden: null });
  });

  it("entrega por renglón: parcial exige motivo, no excede lo recetado, y se finaliza solo tras entregar", async () => {
    const { a, renglones } = await enFarmacia();
    const url = `/api/atenciones/${a.id_atencion}/entregas`;
    expect((await enviar(a.id_atencion, "finalizar", farm)).body.error.codigo).toBe("ENTREGA_PENDIENTE");
    const [r1, r2] = renglones;
    expect((await post(m.app, url, farm, { lineas: [{ id_receta_detalle: r1.id_receta_detalle, cantidad_entregada: 20 }] }, IP)).body.error.codigo).toBe("RENGLONES_INCOMPLETOS");
    expect((await post(m.app, url, farm, { lineas: [{ id_receta_detalle: r1.id_receta_detalle, cantidad_entregada: 21 }, { id_receta_detalle: r2.id_receta_detalle, cantidad_entregada: 10 }] }, IP)).body.error.codigo).toBe("CANTIDAD_EXCEDIDA");
    expect((await post(m.app, url, farm, { lineas: [{ id_receta_detalle: r1.id_receta_detalle, cantidad_entregada: 5 }, { id_receta_detalle: r2.id_receta_detalle, cantidad_entregada: 10 }] }, IP)).body.error.codigo).toBe("OBSERVACION_REQUERIDA");
    const antes = (await m.dueno.query("SELECT last_value FROM seq_numero_orden_farmacia")).rows[0].last_value;
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM entregas_farmacia WHERE id_receta IN (SELECT id_receta FROM recetas WHERE id_atencion = $1)", [a.id_atencion])).rows[0].n).toBe(0);
    expect((await m.dueno.query("SELECT last_value FROM seq_numero_orden_farmacia")).rows[0].last_value).toBe(antes); // los rechazos no consumen números
    const ok = await post(m.app, url, farm, { recibido_por: "María López", lineas: [
      { id_receta_detalle: r1.id_receta_detalle, cantidad_entregada: 5, observacion: "Sin existencia" }, { id_receta_detalle: r2.id_receta_detalle, cantidad_entregada: 10 }] }, IP);
    expect(ok.status).toBe(201);
    const hechos = ok.body.renglones as { numero_orden: number; cantidad_no_entregada: number; recibido_por: string }[];
    expect(hechos.every((x) => x.numero_orden > 0)).toBe(true);
    expect(hechos[0]).toMatchObject({ cantidad_no_entregada: 15, recibido_por: "María López" });
    expect(ok.body.pendiente).toBe(false);
    expect((await post(m.app, url, farm, { lineas: [{ id_receta_detalle: r1.id_receta_detalle, cantidad_entregada: 1 }] }, IP)).body.error.codigo).toBe("SIN_PENDIENTES");
    expect((await enviar(a.id_atencion, "finalizar", farm)).body.estado).toBe("finalizada");
  });

  it("permisos: solo farmacia (y administrador) entrega; otras áreas y otro farmacéutico reciben 403", async () => {
    const { a, renglones } = await enFarmacia();
    const cuerpo = { lineas: renglones.map((r) => ({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: r.cantidad_recetada })) };
    for (const c of [rec, signos, docA, nutri, vac]) expect((await post(m.app, `/api/atenciones/${a.id_atencion}/entregas`, c, cuerpo, IP)).status).toBe(403);
    expect((await get(m.app, `/api/atenciones/${a.id_atencion}/panel`, docA, IP)).status).toBe(403);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/entregas`, farm, cuerpo, IP)).status).toBe(201);
  });

  it("los números de orden son continuos y no se repiten", async () => {
    const x = await enFarmacia(); const y = await enFarmacia();
    for (const e of [x, y]) await post(m.app, `/api/atenciones/${e.a.id_atencion}/entregas`, admin, { lineas: e.renglones.map((r) => ({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: r.cantidad_recetada })) }, IP);
    const o = (await m.dueno.query("SELECT numero_orden FROM entregas_farmacia ORDER BY numero_orden")).rows.map((r) => r.numero_orden as number);
    expect(new Set(o).size).toBe(o.length);
  });
});
