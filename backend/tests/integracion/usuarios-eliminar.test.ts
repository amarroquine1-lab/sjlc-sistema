import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearUsuarioApi, get, hayBd, idUsuarioDe, ingresar, montar, post, type Montaje } from "./ayudas.js";

// Eliminar sirve para cualquier usuario: sin actividad se borra por completo; con actividad se quita del sistema
// (no ingresa, no se reactiva, desaparece de la lista) y su nombre se conserva en todos los registros.
describe.skipIf(!hayBd)("eliminar usuarios", () => {
  let m: Montaje; let admin: string; let idAdmin: number;
  const IP = "198.51.111.1";
  beforeAll(async () => { m = montar(); admin = (await ingresar(m.app, "padmin", "198.51.111.2")).cookie!; idAdmin = await idUsuarioDe(m.dueno, "padmin"); });
  afterAll(async () => { await m.cerrar(); });
  const lista = async (extra = "") => (await get(m.app, `/api/usuarios?por_pagina=100${extra}`, admin, IP)).body.datos as Record<string, any>[];
  const fila = async (id: number, extra = "") => (await lista(extra)).find((u) => u.id_usuario === id);
  const eliminar = (id: number, confirmacion: string, cookie = admin) => post(m.app, `/api/usuarios/${id}/eliminar`, cookie, { confirmacion }, IP);
  const bitacoraDe = async (id: number) => (await m.dueno.query("SELECT id_usuario, valor_anterior, valor_nuevo FROM bitacora WHERE accion = 'eliminar' AND entidad = 'usuarios' AND id_registro = $1", [id])).rows;

  it("sin actividad se borra por completo: pide el nombre exacto y deja el rastro en la bitácora", async () => {
    const u = await crearUsuarioApi(m, admin, "recepcion", "Creado", "PorError");
    expect(await fila(u.id)).toMatchObject({ puede_eliminar: true, motivo_no_eliminar: null, tiene_registros: false, modo_eliminacion: "borrar" });
    const mal = await eliminar(u.id, "otro");
    expect(mal.status).toBe(422); expect(mal.body.error.codigo).toBe("CONFIRMACION_INCORRECTA");
    expect(await fila(u.id)).toBeTruthy();
    const ok = await eliminar(u.id, u.nombre);
    expect(ok.status).toBe(200); expect(ok.body).toMatchObject({ eliminado: true, modo: "borrar", nombre_usuario: u.nombre });
    expect(await fila(u.id, "&incluir_eliminados=true")).toBeUndefined();
    expect((await get(m.app, `/api/usuarios/${u.id}`, admin, IP)).status).toBe(404);
    const b = await bitacoraDe(u.id);
    expect(b).toHaveLength(1);
    expect(b[0].id_usuario).toBe(idAdmin); expect(b[0].valor_nuevo).toBeNull();
    expect(b[0].valor_anterior).toMatchObject({ nombre_usuario: u.nombre, nombres: "Creado" });
    expect(JSON.stringify(b[0].valor_anterior)).not.toContain("contrasena_hash");
    const evento = (await get(m.app, "/api/bitacora?accion=eliminar&entidad=usuarios", admin, IP)).body.datos.find((x: { id_registro: number | string }) => Number(x.id_registro) === u.id);
    expect(evento).toMatchObject({ usuario: "padmin", accion: "eliminar" });
    expect(evento.detalle).toContain(`Se borró por completo al usuario ${u.nombre}`);
  });

  it("con actividad se quita del sistema: desaparece, no ingresa, no se reactiva, y sus registros conservan su nombre", async () => {
    const u = await crearUsuarioApi(m, admin, "recepcion", "Con", "Historia");
    const sesion = (await ingresar(m.app, u.nombre, "198.51.111.4", u.temporal)).cookie!;
    await m.dueno.query("INSERT INTO pacientes (nombres, apellidos, fecha_nacimiento, sexo, id_usuario) VALUES ('Paciente', 'Conservado', DATE '1990-01-01', 'F', $1)", [u.id]);
    expect(await fila(u.id)).toMatchObject({ puede_eliminar: true, tiene_registros: true, modo_eliminacion: "quitar", motivo_no_eliminar: null });
    const eventosAntes = (await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE id_usuario = $1", [u.id])).rows[0].n;
    expect(eventosAntes).toBeGreaterThan(0);

    const r = await eliminar(u.id, u.nombre);
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ eliminado: true, modo: "quitar" });
    // desaparece de la lista; con el filtro "mostrar eliminados" se consulta
    expect(await fila(u.id)).toBeUndefined();
    const consulta = await fila(u.id, "&incluir_eliminados=true");
    expect(consulta).toMatchObject({ nombre_usuario: u.nombre, activo: false, puede_eliminar: false, motivo_no_eliminar: "Este usuario ya fue eliminado." });
    expect(consulta.eliminado_el).toBeTruthy();
    // no puede ingresar y su sesión abierta se cerró
    const intento = await ingresar(m.app, u.nombre, "198.51.111.5", u.temporal);
    expect(intento.r.status).toBe(401); expect(intento.r.body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
    expect((await get(m.app, "/api/yo", sesion, IP)).status).toBe(401);
    // no se modifica ni se reactiva, ni por la API ni directamente en la base
    for (const [accion, cuerpo] of [["activar", {}], ["desactivar", {}], ["restablecer-contrasena", {}], ["desbloquear", {}]] as const) {
      const x = await post(m.app, `/api/usuarios/${u.id}/${accion}`, admin, cuerpo, IP);
      expect(x.status, accion).toBe(409); expect(x.body.error.codigo, accion).toBe("USUARIO_ELIMINADO");
    }
    expect((await eliminar(u.id, u.nombre)).body.error.codigo).toBe("USUARIO_ELIMINADO");
    await expect(m.dueno.query("UPDATE usuarios SET activo = true WHERE id_usuario = $1", [u.id])).rejects.toMatchObject({ code: "23001" });
    await expect(m.dueno.query("DELETE FROM usuarios WHERE id_usuario = $1", [u.id])).rejects.toMatchObject({ code: "23001" });
    // sus registros conservan el nombre y la bitácora sigue apuntando a él
    const reg = (await m.dueno.query("SELECT u.nombre_usuario, u.nombres FROM pacientes p JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE p.apellidos = 'Conservado' AND p.id_usuario = $1", [u.id])).rows;
    expect(reg).toEqual([{ nombre_usuario: u.nombre, nombres: "Con" }]);
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE id_usuario = $1", [u.id])).rows[0].n).toBeGreaterThanOrEqual(eventosAntes);
    // queda en la bitácora como eliminar, con quién lo hizo
    const b = await bitacoraDe(u.id);
    expect(b).toHaveLength(1);
    expect(b[0].id_usuario).toBe(idAdmin);
    expect(b[0].valor_anterior.eliminado_el).toBeNull(); expect(b[0].valor_nuevo.eliminado_el).toBeTruthy();
    expect(JSON.stringify(b[0])).not.toContain("contrasena_hash");
    const evento = (await get(m.app, "/api/bitacora?accion=eliminar&entidad=usuarios", admin, IP)).body.datos.find((x: { id_registro: number | string }) => Number(x.id_registro) === u.id);
    expect(evento.detalle).toContain(`Se quitó del sistema al usuario ${u.nombre}`); expect(evento.detalle).toContain("sus registros se conservan");
    // su nombre de usuario queda reservado
    const reuso = await post(m.app, "/api/usuarios", admin, { nombres: "X", apellidos: "Y", id_rol: (await m.dueno.query("SELECT id_rol FROM roles WHERE nombre_rol = 'recepcion'")).rows[0].id_rol, nombre_usuario: u.nombre }, IP);
    expect(reuso.status).toBe(409); expect(reuso.body.error.codigo).toBe("NOMBRE_USUARIO_EN_USO");
  });

  it("un intento fallido de ingreso también cuenta como actividad: se quita en lugar de borrar", async () => {
    const u = await crearUsuarioApi(m, admin, "doctor", "Fallo", "Solo");
    await ingresar(m.app, u.nombre, "198.51.111.6", "incorrecta-1");
    expect(await fila(u.id)).toMatchObject({ puede_eliminar: true, modo_eliminacion: "quitar" });
    expect((await eliminar(u.id, u.nombre)).body.modo).toBe("quitar");
    expect((await m.dueno.query("SELECT eliminado_el FROM usuarios WHERE id_usuario = $1", [u.id])).rows[0].eliminado_el).toBeTruthy();
  });

  it("nadie se elimina a sí mismo, la cuenta del sistema no es accesible y el último administrador activo se protege en la base", async () => {
    const yo = await fila(idAdmin);
    expect(yo).toMatchObject({ puede_eliminar: false, motivo_no_eliminar: "No puede eliminar su propia cuenta." });
    const r = await eliminar(idAdmin, "padmin");
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("NO_SOBRE_SI_MISMO");
    const sistema = await idUsuarioDe(m.dueno, "sistema");
    expect((await eliminar(sistema, "sistema")).status).toBe(404);
    await expect(m.dueno.query("UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = $1", [sistema])).rejects.toMatchObject({ code: "23001" });
    // la base lo rechaza aunque se salte el backend (como la aplicación, identificándose a sí mismo)
    const cliente = await m.poolApp.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("SELECT set_config('sjlc.id_usuario', $1, true)", [String(idAdmin)]);
      await expect(cliente.query("UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = $1", [idAdmin])).rejects.toMatchObject({ code: "23001" });
    } finally { await cliente.query("ROLLBACK"); cliente.release(); }
  });

  it("solo el administrador elimina: los demás roles reciben 403 y la aplicación no cambia nada sin saber quién opera", async () => {
    const u = await crearUsuarioApi(m, admin, "recepcion", "Permiso", "Negado");
    for (const [rol, usuario] of [["recepcion", "precepcion"], ["doctor", "pdoctor"], ["farmacia", "pfarmacia"]] as const) {
      const c = (await ingresar(m.app, usuario, `198.51.111.${rol.length + 20}`)).cookie!;
      const r = await eliminar(u.id, u.nombre, c);
      expect(r.status, rol).toBe(403); expect(r.body.error.codigo).toBe("SIN_PERMISO");
    }
    expect((await post(m.app, `/api/usuarios/${u.id}/eliminar`, undefined, { confirmacion: u.nombre }, IP)).status).toBe(401);
    expect(await fila(u.id)).toBeTruthy();
    const cliente = await m.poolApp.connect();
    try {
      await cliente.query("BEGIN");
      await expect(cliente.query("DELETE FROM usuarios WHERE id_usuario = $1", [u.id])).rejects.toMatchObject({ code: "42501" });
      await cliente.query("ROLLBACK"); await cliente.query("BEGIN");
      await expect(cliente.query("UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = $1", [u.id])).rejects.toMatchObject({ code: "42501" });
    } finally { await cliente.query("ROLLBACK"); cliente.release(); }
  });
});
