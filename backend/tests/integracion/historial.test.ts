import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirAtencion, crearPaciente, crearUsuarioApi, get, hayBd, ingresar, montar, post, put, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("historial del paciente, bitácora y estado de colas", () => {
  let m: Montaje; const c: Record<string, string> = {};
  const IP = "198.51.109.1";
  beforeAll(async () => {
    m = montar();
    let i = 2;
    for (const u of ["precepcion", "psignos", "pdoctor", "pnutricion", "pvacunacion", "pfarmacia", "padmin"]) c[u] = (await ingresar(m.app, u, `198.51.109.${i++}`)).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });
  const enviar = (id: number, destino: string, cookie: string) => post(m.app, `/api/atenciones/${id}/enviar`, cookie, { destino }, IP);

  it("reúne signos, consulta, receta, entrega y recorrido de cada atención y deja rastro en la bitácora", async () => {
    await post(m.app, "/api/administracion/cierre-del-dia", c.padmin, {}, IP);
    const p = await crearPaciente(m, c.precepcion); const a = await abrirAtencion(m, c.precepcion, p.id_paciente);
    await post(m.app, "/api/cola/signos/llamar-siguiente", c.psignos, {}, IP);
    await post(m.app, `/api/atenciones/${a.id_atencion}/signos`, c.psignos, { peso_lb: 132, talla_cm: 160, temperatura_c: 37 }, IP);
    await enviar(a.id_atencion, "doctor", c.psignos);
    await post(m.app, "/api/cola/doctor/llamar-siguiente", c.pdoctor, {}, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/consulta`, c.pdoctor, { tipo_consulta: "primera", motivo_consulta: "Tos", diagnosticos: [{ descripcion_diagnostico: "Bronquitis", codigo_cie10: "J20.9" }] }, IP);
    await put(m.app, `/api/atenciones/${a.id_atencion}/receta`, c.pdoctor, { lineas: [{ medicamento: "Amoxicilina 500 mg", presentacion: "cápsula", cantidad_recetada: 10, indicaciones: "1 al día" }] }, IP);
    await enviar(a.id_atencion, "farmacia", c.pdoctor);
    const s = await post(m.app, "/api/cola/farmacia/llamar-siguiente", c.pfarmacia, {}, IP);
    await post(m.app, `/api/atenciones/${a.id_atencion}/entregas`, c.pfarmacia, { lineas: s.body.especifico.renglones.map((r: { id_receta_detalle: number }) => ({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: 10 })) }, IP);
    await enviar(a.id_atencion, "finalizar", c.pfarmacia);

    const h = await get(m.app, `/api/pacientes/${p.id_paciente}/historial`, c.pnutricion, IP);
    expect(h.status).toBe(200);
    expect(h.body.total).toBe(1);
    const x = h.body.atenciones[0];
    expect(x).toMatchObject({ numero_atencion: a.numero_atencion, estado: "finalizada" });
    expect(x.recorrido.map((r: { area: string }) => r.area)).toEqual(["signos vitales", "doctor", "farmacia"]);
    expect(x.recorrido[1].atendio).toBeTruthy();
    expect(x.signos.peso_lb).toBe(132);
    expect(x.consulta.diagnosticos[0]).toMatchObject({ cie10: "J20.9" });
    expect(x.receta[0]).toMatchObject({ cantidad_entregada: 10, cantidad_no_entregada: 0 });
    const b = await m.dueno.query("SELECT detalle, direccion_ip FROM bitacora WHERE accion = 'ver_historial' AND id_registro = $1 AND detalle LIKE 'historial completo%'", [p.id_paciente]);
    expect(b.rowCount).toBe(1);
    expect(String(b.rows[0].direccion_ip)).toBe(IP); // la IP real de quien consultó
  });

  it("todos los roles ven el historial; sin sesión no; paciente inexistente da 404", async () => {
    const p = await crearPaciente(m, c.precepcion);
    for (const u of Object.keys(c)) expect((await get(m.app, `/api/pacientes/${p.id_paciente}/historial`, c[u], IP)).status).toBe(200);
    expect((await get(m.app, `/api/pacientes/${p.id_paciente}/historial`, undefined, IP)).status).toBe(401);
    expect((await get(m.app, "/api/pacientes/99999999/historial", c.padmin, IP)).status).toBe(404);
    expect((await get(m.app, `/api/pacientes/${p.id_paciente}/historial?por_pagina=500`, c.padmin, IP)).status).toBe(422);
  });

  it("la unión de pacientes consolida el historial en el registro principal", async () => {
    const a = await crearPaciente(m, c.precepcion); const b = await crearPaciente(m, c.precepcion);
    const aten = await abrirAtencion(m, c.precepcion, b.id_paciente);
    await post(m.app, `/api/atenciones/${aten.id_atencion}/se-retiro`, c.precepcion, {}, IP);
    expect((await post(m.app, `/api/pacientes/${a.id_paciente}/unir`, c.precepcion, { id_paciente_unido: b.id_paciente, motivo: "Mismo paciente registrado dos veces" }, IP)).status).toBeLessThan(300);
    const h = await get(m.app, `/api/pacientes/${a.id_paciente}/historial`, c.precepcion, IP);
    expect(h.body.atenciones.map((x: { numero_atencion: string }) => x.numero_atencion)).toContain(aten.numero_atencion);
  });

  it("bitácora y estado de colas: solo administradores, con filtros y detalle", async () => {
    for (const u of Object.keys(c).filter((x) => x !== "padmin")) {
      expect((await get(m.app, "/api/bitacora", c[u], IP)).status).toBe(403);
      expect((await get(m.app, "/api/bitacora/1", c[u], IP)).status).toBe(403);
      expect((await get(m.app, "/api/administracion/colas", c[u], IP)).status).toBe(403);
    }
    const todo = await get(m.app, "/api/bitacora?por_pagina=5", c.padmin, IP);
    expect(todo.status).toBe(200); expect(todo.body.datos.length).toBe(5); expect(todo.body.total).toBeGreaterThan(5);
    const f = await get(m.app, "/api/bitacora?accion=ver_historial&usuario=pnutri", c.padmin, IP);
    expect(f.body.datos.length).toBeGreaterThan(0);
    expect(f.body.datos.every((x: { accion: string; usuario: string }) => x.accion === "ver_historial" && x.usuario === "pnutricion")).toBe(true);
    expect((await get(m.app, "/api/bitacora?desde=2026-02-31", c.padmin, IP)).status).toBe(422);
    expect((await get(m.app, "/api/bitacora?orden=x", c.padmin, IP)).status).toBe(422);
    const det = await get(m.app, `/api/bitacora/${todo.body.datos[0].id_bitacora}`, c.padmin, IP);
    expect(det.status).toBe(200);
    expect((await get(m.app, "/api/bitacora/999999999", c.padmin, IP)).status).toBe(404);
    expect((await get(m.app, "/api/bitacora/opciones", c.padmin, IP)).body.acciones).toContain("inicio_sesion");
    // la contraseña nunca aparece en la bitácora (ni en el detalle del cambio)
    const u = (await crearUsuarioApi(m, c.padmin, "farmacia")).id;
    expect((await post(m.app, `/api/usuarios/${u}/restablecer-contrasena`, c.padmin, {}, IP)).status).toBe(200);
    const ed = await get(m.app, `/api/bitacora?entidad=usuarios&accion=editar&por_pagina=100`, c.padmin, IP);
    let visto = false;
    for (const fila of ed.body.datos.filter((x: { id_registro: string | number }) => Number(x.id_registro) === u).slice(0, 5)) {
      const d = (await get(m.app, `/api/bitacora/${fila.id_bitacora}`, c.padmin, IP)).body;
      expect(JSON.stringify(d)).not.toMatch(/argon2|contrasena_hash/);
      if (d.valor_nuevo?.contrasena_cambiada === true) visto = true;
    }
    expect(visto).toBe(true);
    // un usuario inexistente se muestra enmascarado en la lista
    await ingresar(m.app, "supersecretoxyz", "198.51.109.50");
    const fall = await get(m.app, "/api/bitacora?accion=inicio_sesion_fallido&por_pagina=20", c.padmin, IP);
    expect(JSON.stringify(fall.body)).not.toContain("supersecretoxyz");
    const col = await get(m.app, "/api/administracion/colas", c.padmin, IP);
    expect(col.status).toBe(200); expect(col.body.areas.map((x: { area: string }) => x.area)).toEqual(["signos vitales", "doctor", "nutrición", "vacunación", "farmacia"]);
  });

  it("buscar y abrir la ficha de un paciente quedan en la bitácora sin guardar el texto buscado", async () => {
    const p = await crearPaciente(m, c.precepcion);
    const r = await get(m.app, `/api/pacientes/buscar?q=${encodeURIComponent(p.codigo_paciente)}`, c.pfarmacia, IP);
    expect(r.status).toBe(200);
    expect((await get(m.app, `/api/pacientes/${p.id_paciente}`, c.pfarmacia, IP)).status).toBe(200);
    const b = await m.dueno.query("SELECT accion, detalle FROM bitacora WHERE accion IN ('buscar_paciente', 'ver_paciente') AND id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'pfarmacia') ORDER BY id_bitacora DESC LIMIT 2");
    expect(b.rows.map((x) => x.accion).sort()).toEqual(["buscar_paciente", "ver_paciente"]);
    expect(JSON.stringify(b.rows)).not.toContain(p.codigo_paciente);
  });
});
