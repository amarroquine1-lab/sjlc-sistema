import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, emergencia, get, hayBd, idUsuarioDe, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("cola de atención, signos vitales y cierre del día", () => {
  let m: Montaje; let rec: string; let signos: string; let docA: string; let docB: string; let admin: string; let nutri: string;
  const IP = "198.51.105.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.105.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.105.3")).cookie!;
    docA = (await ingresar(m.app, "pdoctor", "198.51.105.4")).cookie!;
    docB = (await ingresar(m.app, "pdoctora", "198.51.105.5")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.105.6")).cookie!;
    nutri = (await ingresar(m.app, "pnutricion", "198.51.105.7")).cookie!;
    // Deja las colas limpias (el seed de pruebas trae atenciones abiertas)
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
  });
  afterAll(async () => { await m.cerrar(); });

  const siguiente = (clave: string, cookie: string) => post(m.app, `/api/cola/${clave}/llamar-siguiente`, cookie, {}, IP);
  const enviar = (id: number, destino: string, cookie: string) => post(m.app, `/api/atenciones/${id}/enviar`, cookie, { destino }, IP);

  it("la atención abierta entra a la cola de signos; la emergencia entra directo a la del doctor", async () => {
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    const e = await emergencia(m, rec);
    const cs = (await get(m.app, "/api/cola/signos", signos, IP)).body;
    expect(cs.en_espera.map((x: { id_atencion: number }) => x.id_atencion)).toContain(a.id_atencion);
    expect(cs.en_espera.find((x: { id_atencion: number }) => x.id_atencion === a.id_atencion)).toMatchObject({ estado: "en_espera", tipo: "consulta general", espera_minutos: 0 });
    const cd = (await get(m.app, "/api/cola/doctor", docA, IP)).body;
    expect(cd.en_espera.map((x: { id_atencion: number }) => x.id_atencion)).toContain(e.id_atencion);
    expect(cd.en_espera[0].es_emergencia).toBe(true);
  });

  it("llamar siguiente asigna al paciente; no se puede atender a dos a la vez y la cola vacía avisa", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    expect((await siguiente("signos", signos)).body.error.codigo).toBe("COLA_VACIA");
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    const p2 = await crearPaciente(m, rec); await abrirAtencion(m, rec, p2.id_paciente);
    const r = await siguiente("signos", signos);
    expect(r.status).toBe(200);
    expect(r.body.atencion).toMatchObject({ id_atencion: a.id_atencion, estado: "en_atencion", area: "signos vitales" });
    expect(r.body.paciente.codigo_paciente).toBe(p.codigo_paciente);
    expect(r.body.opciones_envio.find((o: { sugerido: boolean }) => o.sugerido).destino).toBe("doctor");
    expect((await siguiente("signos", signos)).body.error.codigo).toBe("YA_ATIENDE");
    const cola = (await get(m.app, "/api/cola/signos", signos, IP)).body;
    expect(cola.mi_atencion.id_atencion).toBe(a.id_atencion);
    expect(cola.en_espera).toHaveLength(1);
    await enviar(a.id_atencion, "doctor", signos);
  });

  it("registra signos vitales con IMC calculado, rechaza valores imposibles y corrige sin borrar", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    const ruta = `/api/atenciones/${a.id_atencion}/signos`;
    // sin haber llamado al paciente, nadie puede registrar signos
    expect((await post(m.app, ruta, signos, { peso_lb: 110 }, IP)).body.error.codigo).toBe("NO_LA_ATIENDE");
    await siguiente("signos", signos);
    const ok = await post(m.app, ruta, signos, { peso_lb: 115.3, talla_cm: 148, temperatura_c: 36.6, presion_sistolica: 139, presion_diastolica: 75, frecuencia_cardiaca: 55, saturacion_oxigeno: 97 }, IP);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ peso_lb: 115.3, talla_cm: 148, presion_sistolica: 139, saturacion_oxigeno: 97, vigente: true });
    expect(ok.body.imc).toEqual({ imc: 23.9, categoria: "Peso normal" });
    for (const malo of [{ peso_lb: 0.1 }, { peso_lb: 661 }, { talla_cm: 20 }, { temperatura_c: 50 }, { presion_sistolica: 300, presion_diastolica: 80 }, { frecuencia_cardiaca: 10 }, { saturacion_oxigeno: 120 }, {}, { rol: "x" }]) {
      expect((await post(m.app, ruta, signos, malo, IP)).status, JSON.stringify(malo)).toBe(422);
    }
    expect((await post(m.app, ruta, signos, { presion_sistolica: 80, presion_diastolica: 90 }, IP)).body.error.codigo).toBe("PRESION_INVALIDA");
    expect((await post(m.app, ruta, signos, { presion_sistolica: 120 }, IP)).body.error.codigo).toBe("PRESION_INCOMPLETA");
    // corrección: el anterior queda no vigente
    const corr = await post(m.app, ruta, signos, { peso_lb: 117, talla_cm: 148 }, IP);
    expect(corr.status).toBe(201); expect(corr.body.peso_lb).toBe(117);
    const h = (await get(m.app, ruta, signos, IP)).body.datos;
    expect(h).toHaveLength(2);
    expect(h.map((x: { vigente: boolean }) => x.vigente)).toEqual([false, true]);
    expect(h[1].corrige_a).toBe(h[0].id_signo_vital);
    // otras áreas no registran signos
    expect((await post(m.app, ruta, docA, { peso_lb: 132 }, IP)).status).toBe(403);
    expect((await post(m.app, ruta, rec, { peso_lb: 132 }, IP)).status).toBe(403);
    await enviar(a.id_atencion, "doctor", signos);
  });

  it("envía de signos al doctor, valida destinos, finaliza y cierra los tramos", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    await siguiente("signos", signos);
    expect((await enviar(a.id_atencion, "farmacia", signos)).body.error.codigo).toBe("DESTINO_NO_VALIDO");
    expect((await enviar(a.id_atencion, "finalizar", signos)).body.error.codigo).toBe("DESTINO_NO_VALIDO");
    expect((await enviar(a.id_atencion, "doctor", rec)).status).toBe(403);
    const env = await enviar(a.id_atencion, "doctor", signos);
    expect(env.body).toMatchObject({ estado: "enviado", destino: "doctor" });
    expect((await enviar(a.id_atencion, "doctor", signos)).status).toBe(403); // ya no está en su área
    const cd = (await get(m.app, "/api/cola/doctor", docA, IP)).body;
    expect(cd.en_espera.find((x: { id_atencion: number }) => x.id_atencion === a.id_atencion).estado).toBe("enviado");
    expect((await siguiente("doctor", docA)).body.atencion.estado).toBe("en_atencion");
    const opc = (await get(m.app, `/api/atenciones/${a.id_atencion}/panel`, docA, IP)).body.opciones_envio.map((o: { destino: string }) => o.destino);
    expect(opc).toEqual(["nutricion", "vacunacion", "farmacia", "finalizar"]); // el doctor siempre ve Farmacia (sin receta pide guardarla)
    expect((await enviar(a.id_atencion, "finalizar", docA)).body.error.codigo).toBe("CONSULTA_FALTANTE");
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, docA, { tipo_consulta: "primera", motivo_consulta: "Control", diagnosticos: [] }, IP);
    expect((await enviar(a.id_atencion, "farmacia", docA)).body.error.codigo).toBe("RECETA_FALTANTE");
    expect((await enviar(a.id_atencion, "finalizar", docA)).body.estado).toBe("finalizada");
    const abiertos = await m.dueno.query("SELECT count(*)::int AS n FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [a.id_atencion]);
    expect(abiertos.rows[0].n).toBe(0);
    const t = await m.dueno.query("SELECT count(*)::int AS n, count(fecha_hora_inicio)::int AS iniciados FROM recorridos_atencion WHERE id_atencion = $1", [a.id_atencion]);
    expect(t.rows[0]).toEqual({ n: 2, iniciados: 2 });
  });

  it("emergencias primero, luego por hora de llegada al área", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const normal = await abrirAtencion(m, rec, p.id_paciente);
    await siguiente("signos", signos); await enviar(normal.id_atencion, "doctor", signos); // llega primero al doctor
    const e = await emergencia(m, rec); // llega después pero es emergencia
    const p2 = await crearPaciente(m, rec); const otro = await abrirAtencion(m, rec, p2.id_paciente);
    await siguiente("signos", signos); await enviar(otro.id_atencion, "doctor", signos);
    const orden = (await get(m.app, "/api/cola/doctor", docA, IP)).body.en_espera.map((x: { id_atencion: number }) => x.id_atencion);
    expect(orden).toEqual([e.id_atencion, normal.id_atencion, otro.id_atencion]);
    expect((await siguiente("doctor", docA)).body.atencion.id_atencion).toBe(e.id_atencion);
    expect((await siguiente("doctor", docB)).body.atencion.id_atencion).toBe(normal.id_atencion);
  });

  it("dos doctores llamando a la vez nunca toman al mismo paciente (concurrencia)", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push((await emergencia(m, rec)).id_atencion);
    const tomados: number[] = [];
    for (let ronda = 0; ronda < 3; ronda++) {
      // cada doctor lanza varias llamadas al mismo tiempo
      const resp = await Promise.all([siguiente("doctor", docA), siguiente("doctor", docB), siguiente("doctor", docA), siguiente("doctor", docB)]);
      const buenas = resp.filter((r) => r.status === 200);
      expect(buenas.length).toBe(2); // uno por doctor
      expect(resp.filter((r) => r.status === 409).every((r) => ["YA_ATIENDE", "LLAMADA_EN_CURSO"].includes(r.body.error.codigo))).toBe(true);
      const idsRonda = buenas.map((r) => r.body.atencion.id_atencion as number);
      expect(new Set(idsRonda).size).toBe(2);
      tomados.push(...idsRonda);
      const [a, b] = [buenas.find((r) => r.body.atencion.id_atencion === idsRonda[0])!, buenas.find((r) => r.body.atencion.id_atencion === idsRonda[1])!];
      void a; void b;
      await Promise.all(idsRonda.map((id) => post(m.app, `/api/atenciones/${id}/enviar`, admin, { destino: "finalizar" }, IP)));
    }
    expect(new Set(tomados).size).toBe(6);
    expect(tomados.sort()).toEqual([...ids].sort());
    const dobles = await m.dueno.query("SELECT id_atencion FROM recorridos_atencion WHERE fecha_hora_inicio IS NOT NULL GROUP BY id_atencion, id_area HAVING count(*) > 1");
    expect(dobles.rowCount).toBe(0);
  });

  it("el cierre del día pasa las atenciones abiertas a no concluida y cierra sus tramos", async () => {
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    const e = await emergencia(m, rec);
    const sistema = await idUsuarioDe(m.dueno, "sistema");
    const { cerrarDia } = await import("../../src/modulos/cola/servicio.js");
    const r = await cerrarDia(m.poolApp, sistema, null);
    expect(r.cerradas).toBeGreaterThanOrEqual(2);
    const estados = await m.dueno.query("SELECT estado FROM atenciones WHERE id_atencion IN ($1, $2)", [a.id_atencion, e.id_atencion]);
    expect(estados.rows.map((x) => x.estado)).toEqual(["no_concluida", "no_concluida"]);
    const abiertos = await m.dueno.query("SELECT count(*)::int AS n FROM recorridos_atencion WHERE fecha_hora_salida IS NULL");
    expect(abiertos.rows[0].n).toBe(0);
    const b = await m.dueno.query("SELECT id_usuario FROM bitacora WHERE accion = 'editar' AND entidad = 'atenciones' AND id_registro = $1 ORDER BY id_bitacora DESC LIMIT 1", [a.id_atencion]);
    expect(b.rows[0].id_usuario).toBe(sistema);
    // el usuario sistema no puede ingresar
    expect((await ingresar(m.app, "sistema", "198.51.105.20", "cualquier-contrasena-1")).r.status).toBe(401);
    // y no deja huecos: se puede volver a abrir una atención al paciente
    expect(p.id_paciente).toBeGreaterThan(0);
    await abrirAtencion(m, rec, p.id_paciente);
  });

  it("permisos por área: cada rol ve solo su cola; recepción no llama; el administrador puede todo", async () => {
    expect((await get(m.app, "/api/cola/doctor", signos, IP)).status).toBe(403);
    expect((await get(m.app, "/api/cola/signos", docA, IP)).status).toBe(403);
    expect((await get(m.app, "/api/cola/signos", rec, IP)).status).toBe(403);
    expect((await siguiente("doctor", rec)).status).toBe(403);
    expect((await siguiente("farmacia", nutri)).status).toBe(403);
    for (const c of ["signos", "doctor", "nutricion", "vacunacion", "farmacia"]) expect((await get(m.app, `/api/cola/${c}`, admin, IP)).status).toBe(200);
    expect((await get(m.app, "/api/atenciones/1/panel", rec, IP)).status).toBe(403);
    expect((await post(m.app, "/api/administracion/cierre-del-dia", signos, {}, IP)).status).toBe(403);
  });

  it("el sondeo automático de la cola no mantiene viva la sesión; una petición del usuario sí", async () => {
    const { cookie } = await ingresar(m.app, "pfarmacia", "198.51.105.30");
    const id = (await m.dueno.query("SELECT id_sesion FROM sesiones s JOIN usuarios u USING (id_usuario) WHERE u.nombre_usuario = 'pfarmacia' ORDER BY fecha_hora_inicio DESC LIMIT 1")).rows[0].id_sesion;
    await m.dueno.query("UPDATE sesiones SET fecha_hora_ultima_actividad = now() - interval '14 minutes' WHERE id_sesion = $1", [id]);
    const auto = await (await import("supertest")).default(m.app).get("/api/cola/farmacia").set("Cookie", cookie ?? "").set("X-Forwarded-For", "198.51.105.30").set("X-Actividad", "automatica");
    expect(auto.status).toBe(200);
    expect((await m.dueno.query("SELECT now() - fecha_hora_ultima_actividad > interval '13 minutes' AS vieja FROM sesiones WHERE id_sesion = $1", [id])).rows[0].vieja).toBe(true);
    expect((await get(m.app, "/api/cola/farmacia", cookie, "198.51.105.30")).status).toBe(200);
    expect((await m.dueno.query("SELECT now() - fecha_hora_ultima_actividad < interval '1 minute' AS reciente FROM sesiones WHERE id_sesion = $1", [id])).rows[0].reciente).toBe(true);
  });

  it("enviar y cierre del día a la vez no dejan tramos abiertos (V-02)", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) ids.push((await emergencia(m, rec)).id_atencion);
    for (const id of ids) await siguiente("doctor", docA).then(async (r) => { if (r.status === 200) await enviar(r.body.atencion.id_atencion, "finalizar", docA); });
    const nuevas: number[] = [];
    for (let i = 0; i < 4; i++) nuevas.push((await emergencia(m, rec)).id_atencion);
    const sistema = await idUsuarioDe(m.dueno, "sistema");
    const { cerrarDia } = await import("../../src/modulos/cola/servicio.js");
    await Promise.all([
      cerrarDia(m.poolApp, sistema, null),
      ...nuevas.map((id) => enviar(id, "nutricion", admin)),
    ]);
    await cerrarDia(m.poolApp, sistema, null);
    const huerfanos = await m.dueno.query(
      "SELECT 1 FROM recorridos_atencion r JOIN atenciones a USING (id_atencion) WHERE r.fecha_hora_salida IS NULL AND a.estado IN ('finalizada','se_retiro','no_concluida')");
    expect(huerfanos.rowCount).toBe(0);
  });

  it("la cuenta sistema no aparece ni se gestiona desde la API de usuarios (V-03)", async () => {
    const sistema = await idUsuarioDe(m.dueno, "sistema");
    const lista = await get(m.app, "/api/usuarios", admin, IP);
    expect(JSON.stringify(lista.body)).not.toContain('"sistema"');
    expect((await get(m.app, `/api/usuarios/${sistema}`, admin, IP)).status).toBe(404);
  });

  it("\"se retiró\" no se permite mientras un área atiende al paciente (V-12)", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const e = await emergencia(m, rec);
    const r = await siguiente("doctor", docA);
    expect(r.status).toBe(200);
    const x = await post(m.app, `/api/atenciones/${e.id_atencion}/se-retiro`, rec, {}, IP);
    expect(x.status).toBe(409);
    expect(x.body.error.codigo).toBe("ATENCION_EN_CURSO");
    await enviar(e.id_atencion, "finalizar", docA);
  });

  it("el historial de signos solo lo ve quien atiende la atención (V-04)", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const p = await crearPaciente(m, rec); const a = await abrirAtencion(m, rec, p.id_paciente);
    expect((await get(m.app, `/api/atenciones/${a.id_atencion}/signos`, nutri, IP)).status).toBe(403);
    expect((await get(m.app, `/api/atenciones/${a.id_atencion}/signos`, admin, IP)).status).toBe(200);
  });

  it("el cierre de días anteriores no toca las atenciones de hoy (recuperación tras una caída)", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", admin, {}, IP);
    const vieja = await emergencia(m, rec); const hoy = await emergencia(m, rec);
    await m.dueno.query("ALTER TABLE atenciones DISABLE TRIGGER USER");
    await m.dueno.query("UPDATE atenciones SET fecha_hora_llegada = now() - interval '2 days' WHERE id_atencion = $1", [vieja.id_atencion]);
    await m.dueno.query("ALTER TABLE atenciones ENABLE TRIGGER USER");
    const sistema = await idUsuarioDe(m.dueno, "sistema");
    const { cerrarDia } = await import("../../src/modulos/cola/servicio.js");
    expect((await cerrarDia(m.poolApp, sistema, null, true)).cerradas).toBe(1);
    const e = await m.dueno.query("SELECT id_atencion, estado FROM atenciones WHERE id_atencion IN ($1, $2) ORDER BY id_atencion", [vieja.id_atencion, hoy.id_atencion]);
    expect(Object.fromEntries(e.rows.map((x) => [x.id_atencion, x.estado]))).toEqual({ [vieja.id_atencion]: "no_concluida", [hoy.id_atencion]: "en_espera" });
  });
});
