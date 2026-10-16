import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearUsuarioApi, get, hayBd, idRol, idUsuarioDe, ingresar, montar, patch, post, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("administración de usuarios", () => {
  let m: Montaje;
  let admin: string;
  let idAdmin: number;
  beforeAll(async () => { m = montar(); admin = (await ingresar(m.app, "padmin", "198.51.101.1")).cookie!; idAdmin = await idUsuarioDe(m.dueno, "padmin"); });
  afterAll(async () => { await m.cerrar(); });

  it("crea un usuario con nombre generado y contraseña temporal que se muestra una sola vez", async () => {
    const r = await post(m.app, "/api/usuarios", admin, { nombres: "José Luis", apellidos: "de la Cruz Quiñónez", id_rol: await idRol(m.dueno, "doctor") });
    expect(r.status).toBe(201);
    expect(r.body.usuario).toMatchObject({ nombre_usuario: expect.stringMatching(/^jcruz[a-z]*$/), rol: "doctor", activo: true, debe_cambiar_contrasena: true });
    const temporal: string = r.body.contrasena_temporal;
    expect(temporal).toHaveLength(14);
    const id = r.body.usuario.id_usuario;
    expect(JSON.stringify((await get(m.app, `/api/usuarios/${id}`, admin)).body)).not.toContain(temporal);
    const fila = (await m.dueno.query("SELECT contrasena_hash FROM usuarios WHERE id_usuario = $1", [id])).rows[0];
    expect(fila.contrasena_hash).toMatch(/^\$argon2id\$/); expect(fila.contrasena_hash).not.toContain(temporal);
    const b = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE valor_nuevo::text LIKE $1 OR valor_anterior::text LIKE $1 OR detalle LIKE $1", [`%${temporal}%`]);
    expect(b.rows[0].n).toBe(0);
    expect((await ingresar(m.app, r.body.usuario.nombre_usuario, "198.51.101.2", temporal)).r.status).toBe(200);
  });

  it("si el nombre de usuario ya existe agrega la siguiente letra del nombre; también acepta uno manual", async () => {
    const rol = await idRol(m.dueno, "recepcion");
    const a = await post(m.app, "/api/usuarios", admin, { nombres: "Marta", apellidos: "Colindres", id_rol: rol });
    const b = await post(m.app, "/api/usuarios", admin, { nombres: "Mario", apellidos: "Colindres", id_rol: rol });
    expect([a.body.usuario.nombre_usuario, b.body.usuario.nombre_usuario]).toEqual(["mcolindres", "macolindres"]);
    const c = await post(m.app, "/api/usuarios", admin, { nombres: "X", apellidos: "Y", id_rol: rol, nombre_usuario: "mcolindres" });
    expect(c.status).toBe(409); expect(c.body.error.codigo).toBe("NOMBRE_USUARIO_EN_USO");
    expect((await post(m.app, "/api/usuarios", admin, { nombres: "X", apellidos: "Y", id_rol: 9999 })).body.error.codigo).toBe("ROL_NO_VALIDO");
  });

  it("lista con filtros y paginación, sin exponer el hash", async () => {
    const r = await get(m.app, "/api/usuarios?por_pagina=3&pagina=1", admin);
    expect(r.status).toBe(200); expect(r.body.datos).toHaveLength(3); expect(r.body.total).toBeGreaterThan(8);
    const f = await get(m.app, "/api/usuarios?rol=doctor&activo=true", admin);
    expect(f.body.datos.every((u: { rol: string }) => u.rol === "doctor")).toBe(true);
    const q = await get(m.app, "/api/usuarios?q=PRECEPCION", admin);
    expect(q.body.datos.some((u: { nombre_usuario: string }) => u.nombre_usuario === "precepcion")).toBe(true);
    expect(JSON.stringify([r.body, f.body, q.body])).not.toMatch(/contrasena_hash|argon2/);
    expect((await get(m.app, "/api/usuarios?por_pagina=1000", admin)).status).toBe(422);
    expect((await get(m.app, "/api/roles", admin)).body.datos).toHaveLength(7);
  });

  it("restablecer la contraseña da una temporal nueva, obliga a cambiarla y cierra las sesiones", async () => {
    const u = await crearUsuarioApi(m, admin, "signos");
    const s = await ingresar(m.app, u.nombre, "198.51.101.3", u.temporal);
    const r = await post(m.app, `/api/usuarios/${u.id}/restablecer-contrasena`, admin);
    expect(r.status).toBe(200); expect(r.body.contrasena_temporal).not.toBe(u.temporal);
    expect((await get(m.app, "/api/yo", s.cookie)).status).toBe(401);
    expect((await ingresar(m.app, u.nombre, "198.51.101.3", u.temporal)).r.status).toBe(401);
    const n = await ingresar(m.app, u.nombre, "198.51.101.3", r.body.contrasena_temporal);
    expect(n.r.status).toBe(200); expect(n.r.body.debe_cambiar_contrasena).toBe(true);
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'restablecer_contrasena' AND id_registro = $1 AND id_usuario = $2", [u.id, idAdmin])).rows[0].n).toBe(1);
  });

  it("desactivar cierra las sesiones, impide el ingreso y se puede revertir", async () => {
    const u = await crearUsuarioApi(m, admin, "vacunacion");
    const s = await ingresar(m.app, u.nombre, "198.51.101.4", u.temporal);
    expect((await post(m.app, `/api/usuarios/${u.id}/desactivar`, admin)).body.activo).toBe(false);
    expect((await get(m.app, "/api/yo", s.cookie)).status).toBe(401);
    const i = await ingresar(m.app, u.nombre, "198.51.101.4", u.temporal);
    expect(i.r.status).toBe(401); expect(i.r.body.error.mensaje).toBe("Usuario o contraseña incorrectos.");
    expect((await post(m.app, `/api/usuarios/${u.id}/activar`, admin)).body.activo).toBe(true);
    expect((await ingresar(m.app, u.nombre, "198.51.101.4", u.temporal)).r.status).toBe(200);
  });

  it("cambiar el rol cierra las sesiones del usuario", async () => {
    const u = await crearUsuarioApi(m, admin, "farmacia");
    const s = await ingresar(m.app, u.nombre, "198.51.101.5", u.temporal);
    const r = await patch(m.app, `/api/usuarios/${u.id}`, admin, { id_rol: await idRol(m.dueno, "doctor"), nombres: "Cambiado" });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ rol: "doctor", nombres: "Cambiado" });
    expect((await get(m.app, "/api/yo", s.cookie)).status).toBe(401);
    expect((await patch(m.app, `/api/usuarios/${u.id}`, admin, {})).status).toBe(422);
  });

  it("desbloquear limpia los intentos y el bloqueo", async () => {
    const u = await crearUsuarioApi(m, admin, "recepcion");
    for (let i = 0; i < 5; i++) await ingresar(m.app, u.nombre, "198.51.101.6", "Equivocada-123456");
    expect((await ingresar(m.app, u.nombre, "198.51.101.6", u.temporal)).r.status).toBe(423);
    const r = await post(m.app, `/api/usuarios/${u.id}/desbloquear`, admin);
    expect(r.body).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
    expect((await ingresar(m.app, u.nombre, "198.51.101.6", u.temporal)).r.status).toBe(200);
  });

  it("un administrador no puede cambiarse el rol ni desactivarse a sí mismo", async () => {
    const rol = await patch(m.app, `/api/usuarios/${idAdmin}`, admin, { id_rol: await idRol(m.dueno, "doctor") });
    expect(rol.status).toBe(409); expect(rol.body.error.codigo).toBe("NO_SOBRE_SI_MISMO");
    expect((await patch(m.app, `/api/usuarios/${idAdmin}`, admin, { nombres: "Otro" })).body.error.codigo).toBe("NO_SOBRE_SI_MISMO");
    const des = await post(m.app, `/api/usuarios/${idAdmin}/desactivar`, admin);
    expect(des.status).toBe(409);
    expect((await get(m.app, "/api/usuarios/999999", admin)).status).toBe(404);
  });
});
