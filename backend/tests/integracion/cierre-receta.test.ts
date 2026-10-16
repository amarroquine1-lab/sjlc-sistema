import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

// Regla de cierre: con una receta sin entregar, Farmacia es el paso final obligatorio.
describe.skipIf(!hayBd)("cierre del ciclo: receta pendiente y farmacia", () => {
  let m: Montaje; let rec: string; let signos: string; let doc: string; let admin: string; let nutri: string; let vac: string; let farm: string;
  const IP = "198.51.109.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.109.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.109.3")).cookie!;
    doc = (await ingresar(m.app, "pdoctor", "198.51.109.4")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.109.6")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.109.7")).cookie!;
    vac = (await ingresar(m.app, "pvacunacion", "198.51.109.8")).cookie!;
    farm = (await ingresar(m.app, "pfarmacia", "198.51.109.9")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const enviar = (id: number, destino: string, c: string) => post(m.app, `/api/atenciones/${id}/enviar`, c, { destino }, IP);
  const opciones = async (id: number, c: string) => ((await get(m.app, `/api/atenciones/${id}/panel`, c, IP)).body.opciones_envio as { destino: string; sugerido: boolean; requiere_receta: boolean }[]);
  const receta = (id: number, c: string) => put(m.app, `/api/atenciones/${id}/receta`, c, { lineas: [
    { medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 10, indicaciones: "1 cada 8 horas" }] }, IP);
  const estado = async (id: number) => (await m.dueno.query("SELECT estado FROM atenciones WHERE id_atencion = $1", [id])).rows[0].estado as string;

  // Atención de consulta general tomada por el doctor, con consulta guardada
  async function conDoctor() {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP); await enviar(a.id_atencion, "doctor", signos);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", doc, {}, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, doc, { tipo_consulta: "primera", motivo_consulta: "Dolor", diagnosticos: [] }, IP);
    return a.id_atencion;
  }

  it("el doctor siempre ve Farmacia; sin receta guardada se rechaza y pide la receta", async () => {
    const id = await conDoctor();
    const o = await opciones(id, doc);
    expect(o.map((x) => x.destino)).toEqual(["nutricion", "vacunacion", "farmacia", "finalizar"]);
    expect(o.find((x) => x.destino === "farmacia")!.requiere_receta).toBe(true);
    const r = await enviar(id, "farmacia", doc);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("RECETA_FALTANTE");
    expect(await estado(id)).toBe("en_atencion");
    expect((await enviar(id, "finalizar", doc)).status).toBe(200); // sin receta, finaliza como siempre
  });

  it("con receta sin entregar el doctor no puede finalizar: Farmacia es la acción principal", async () => {
    const id = await conDoctor();
    expect((await receta(id, doc)).status).toBe(200);
    const o = await opciones(id, doc);
    expect(o.map((x) => x.destino)).not.toContain("finalizar");
    expect(o.find((x) => x.destino === "farmacia")).toMatchObject({ sugerido: true, requiere_receta: false });
    const r = await enviar(id, "finalizar", doc);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("RECETA_PENDIENTE");
    expect(await estado(id)).toBe("en_atencion");
    // tampoco el administrador puede saltarse la regla
    expect((await enviar(id, "finalizar", admin)).status).toBe(409);
  });

  it("farmacia entrega y finaliza en un solo paso; si la entrega es inválida no se cierra nada", async () => {
    const id = await conDoctor(); await receta(id, doc);
    expect((await enviar(id, "farmacia", doc)).status).toBe(200);
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", farm, {}, IP);
    const renglon = s.body.especifico.renglones[0] as { id_receta_detalle: number };
    // entrega parcial sin motivo: se rechaza y la atención sigue abierta
    const mal = await post(m.app, `/api/atenciones/${id}/entregas`, farm, { finalizar: true, lineas: [{ id_receta_detalle: renglon.id_receta_detalle, cantidad_entregada: 5 }] }, IP);
    expect(mal.status).toBe(422); expect(await estado(id)).toBe("en_atencion");
    const bien = await post(m.app, `/api/atenciones/${id}/entregas`, farm, { finalizar: true, lineas: [{ id_receta_detalle: renglon.id_receta_detalle, cantidad_entregada: 10 }] }, IP);
    expect(bien.status).toBe(201);
    expect(await estado(id)).toBe("finalizada");
    const abiertos = await m.dueno.query("SELECT 1 FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [id]);
    expect(abiertos.rowCount).toBe(0);
  });

  it("sin la marca finalizar la entrega deja la atención abierta y farmacia la cierra después", async () => {
    const id = await conDoctor(); await receta(id, doc); await enviar(id, "farmacia", doc);
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", farm, {}, IP);
    const renglon = s.body.especifico.renglones[0] as { id_receta_detalle: number };
    expect((await post(m.app, `/api/atenciones/${id}/entregas`, farm, { lineas: [{ id_receta_detalle: renglon.id_receta_detalle, cantidad_entregada: 10 }] }, IP)).status).toBe(201);
    expect(await estado(id)).toBe("en_atencion");
    expect((await enviar(id, "finalizar", farm)).status).toBe(200);
    expect(await estado(id)).toBe("finalizada");
  });

  it("doctor → vacunación con receta pendiente: vacunación no finaliza y envía a Farmacia", async () => {
    const id = await conDoctor(); await receta(id, doc);
    expect((await enviar(id, "vacunacion", doc)).status).toBe(200);
    await post(m.app, "/api/cola/vacunacion/llamar-siguiente", vac, {}, IP);
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guatemala" });
    expect((await post(m.app, `/api/atenciones/${id}/vacunas`, vac, { nombre_vacuna: "Vacuna de prueba", numero_dosis: 1, lote: "L1", fecha_aplicacion: hoy }, IP)).status).toBe(201);
    const o = await opciones(id, vac);
    expect(o.map((x) => x.destino)).not.toContain("finalizar");
    expect(o.find((x) => x.destino === "farmacia")!.sugerido).toBe(true);
    const r = await enviar(id, "finalizar", vac);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("RECETA_PENDIENTE");
    expect((await enviar(id, "farmacia", vac)).status).toBe(200);
  });

  it("doctor → nutrición con receta pendiente: nutrición no finaliza y envía a Farmacia", async () => {
    const id = await conDoctor(); await receta(id, doc);
    expect((await enviar(id, "nutricion", doc)).status).toBe(200);
    await post(m.app, "/api/cola/nutricion/llamar-siguiente", nutri, {}, IP);
    expect((await put(m.app, `/api/atenciones/${id}/evaluacion-nutricional`, nutri, { diagnostico_nutricional: "Estado nutricional normal" }, IP)).status).toBe(200);
    const r = await enviar(id, "finalizar", nutri);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("RECETA_PENDIENTE");
    expect((await opciones(id, nutri)).find((x) => x.destino === "farmacia")!.sugerido).toBe(true);
    expect((await enviar(id, "farmacia", nutri)).status).toBe(200);
  });

  it("farmacia no ve el motivo de envío (datos mínimos), ni en la cola ni en el panel", async () => {
    const id = await conDoctor(); await receta(id, doc);
    expect((await post(m.app, `/api/atenciones/${id}/enviar`, doc, { destino: "farmacia", motivo: "Texto libre del doctor" }, IP)).status).toBe(200);
    const cola = await get(m.app, "/api/cola/farmacia", farm, IP);
    expect(cola.body.en_espera.find((x: { id_atencion: number }) => x.id_atencion === id).motivo_envio).toBeNull();
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", farm, {}, IP);
    expect(s.body.atencion.motivo_envio).toBeNull();
  });
});
