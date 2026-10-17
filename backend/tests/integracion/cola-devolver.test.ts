import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, emergencia, get, hayBd, ingresar, montar, post, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("devolver a la cola", () => {
  let m: Montaje; let rec: string; let admin: string; let signos: string; let doctor: string; let nutri: string;
  const IP = "198.51.107.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.107.2")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.107.3")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.107.4")).cookie!;
    doctor = (await ingresar(m.app, "pdoctor", "198.51.107.5")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.107.6")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  beforeEach(async () => { await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP); });

  const nuevo = async () => abrirAtencion(m, rec, (await crearPaciente(m, rec)).id_paciente);
  const esperando = async (clave: string, cookie: string) => (await get(m.app, `/api/cola/${clave}`, cookie, IP)).body.en_espera.map((x: { id_atencion: number }) => x.id_atencion) as number[];

  it("regresa al paciente a su posición original, deja libre al usuario y queda en la bitácora", async () => {
    const a1 = await nuevo(); const a2 = await nuevo();
    const antes = (await m.dueno.query("SELECT fecha_hora_entrada FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [a1.id_atencion])).rows[0].fecha_hora_entrada;
    // Llama al primero por error
    expect((await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP)).body.atencion.id_atencion).toBe(a1.id_atencion);
    expect(await esperando("signos", signos)).toEqual([a2.id_atencion]);
    const r = await post(m.app, `/api/atenciones/${a1.id_atencion}/devolver`, signos, {}, IP);
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ id_atencion: a1.id_atencion, numero_atencion: a1.numero_atencion });
    // Vuelve primero en la cola, con la misma hora de llegada, en espera, y no cuenta como atendido
    expect(await esperando("signos", signos)).toEqual([a1.id_atencion, a2.id_atencion]);
    const t = (await m.dueno.query("SELECT fecha_hora_entrada, fecha_hora_inicio, id_usuario FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [a1.id_atencion])).rows[0];
    expect(t.fecha_hora_entrada).toEqual(antes); expect(t.fecha_hora_inicio).toBeNull(); expect(t.id_usuario).toBeNull();
    expect((await m.dueno.query("SELECT estado FROM atenciones WHERE id_atencion = $1", [a1.id_atencion])).rows[0].estado).toBe("en_espera");
    const cola = (await get(m.app, "/api/cola/signos", signos, IP)).body;
    expect(cola.mi_atencion).toBeNull(); expect(cola.mi_atencion_otra_area).toBeNull();
    // Bitácora: quién, cuándo y desde qué área
    const ev = await m.dueno.query("SELECT detalle, id_usuario, fecha_hora FROM bitacora WHERE accion = 'devolver_a_cola' AND id_registro = $1", [a1.id_atencion]);
    expect(ev.rowCount).toBe(1); expect(ev.rows[0].detalle).toContain("signos vitales"); expect(ev.rows[0].fecha_hora).toBeTruthy();
    expect(ev.rows[0].id_usuario).toBe((await m.dueno.query("SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'psignos'")).rows[0].id_usuario);
    // El usuario queda libre: llama de nuevo y le toca otra vez el primero de la cola
    expect((await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP)).body.atencion.id_atencion).toBe(a1.id_atencion);
  });

  it("si ya se guardaron datos en ese tramo, no se permite devolver", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, signos, { peso_lb: 120 }, IP)).status).toBe(201);
    const r = await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, signos, {}, IP);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("YA_HAY_DATOS"); expect(r.body.error.mensaje).toContain("ya se guardaron datos");
    // Sigue en atención y sin evento en la bitácora
    expect((await get(m.app, "/api/cola/signos", signos, IP)).body.mi_atencion.id_atencion).toBe(a.id_atencion);
    expect((await m.dueno.query("SELECT 1 FROM bitacora WHERE accion = 'devolver_a_cola' AND id_registro = $1", [a.id_atencion])).rowCount).toBe(0);
  });

  it("los datos guardados en un tramo anterior no impiden devolver en el siguiente; conserva el motivo del envío", async () => {
    const a = await nuevo();
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, signos, { peso_lb: 120 }, IP);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/enviar`, signos, { destino: "doctor", motivo: "Dolor de cabeza" }, IP)).status).toBe(200);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", doctor, {}, IP);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, doctor, {}, IP)).status).toBe(200);
    const fila = (await get(m.app, "/api/cola/doctor", doctor, IP)).body.en_espera.find((x: { id_atencion: number }) => x.id_atencion === a.id_atencion);
    expect(fila).toMatchObject({ estado: "en_espera", motivo_envio: "Dolor de cabeza" });
  });

  it("solo puede devolver quien lo atiende en esa área (o administración); el paciente en espera no se devuelve", async () => {
    const a = await nuevo();
    // En espera: nadie operativo lo atiende
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, signos, {}, IP)).body.error.codigo).toBe("NO_LA_ATIENDE");
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, admin, {}, IP)).body.error.codigo).toBe("NO_EN_ATENCION");
    await post(m.app, "/api/cola/signos/llamar-siguiente", signos, {}, IP);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, doctor, {}, IP)).status).toBe(403);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, nutri, {}, IP)).status).toBe(403);
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, rec, {}, IP)).status).toBe(403);
    // Administración sí puede
    expect((await post(m.app, `/api/atenciones/${a.id_atencion}/devolver`, admin, {}, IP)).status).toBe(200);
  });

  it("también funciona en la cola del doctor con una emergencia", async () => {
    const e = await emergencia(m, rec);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", doctor, {}, IP);
    expect((await post(m.app, `/api/atenciones/${e.id_atencion}/devolver`, doctor, {}, IP)).status).toBe(200);
    expect(await esperando("doctor", doctor)).toContain(e.id_atencion);
  });
});
