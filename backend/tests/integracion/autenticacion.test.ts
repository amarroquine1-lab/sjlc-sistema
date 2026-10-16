import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTRASENA, cookieDe, crearUsuarioApi, get, hayBd, idUsuarioDe, ingresar, montar, patch, post, type Montaje } from "./ayudas.js";

describe.skipIf(!hayBd)("autenticación y sesión", () => {
  let m: Montaje;
  let admin: string;
  beforeAll(async () => { m = montar(); admin = (await ingresar(m.app, "padmin", "198.51.100.1")).cookie!; });
  afterAll(async () => { await m.cerrar(); });

  const sesionDe = async (nombre: string) =>
    (await m.dueno.query("SELECT id_sesion FROM sesiones s JOIN usuarios u USING (id_usuario) WHERE u.nombre_usuario = $1 ORDER BY fecha_hora_inicio DESC LIMIT 1", [nombre])).rows[0].id_sesion as string;

  it("el ingreso correcto fija la cookie con HttpOnly, Secure, SameSite=Strict y sin vencimiento", async () => {
    const { r } = await ingresar(m.app, "psignos", "198.51.100.2");
    expect(r.status).toBe(200);
    const c = (r.headers["set-cookie"] as unknown as string[])[0];
    expect(c).toMatch(/^sjlc_sesion=/);
    expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/Secure/i); expect(c).toMatch(/SameSite=Strict/i); expect(c).toMatch(/Path=\/api/);
    expect(c).not.toMatch(/Max-Age|Expires/i);
    expect(JSON.stringify(r.body)).not.toMatch(/token|jwt/i);
  });

  it("usuario inexistente y contraseña errónea dan la misma respuesta", async () => {
    const a = await ingresar(m.app, "noexisteesteusuario", "198.51.100.3", "Contrasena-incorrecta-1");
    const b = await ingresar(m.app, "pfarmacia", "198.51.100.3", "Contrasena-incorrecta-1");
    expect(a.r.status).toBe(401); expect(b.r.status).toBe(401);
    expect(a.r.body).toEqual(b.r.body);
    expect(a.r.body.error.mensaje).toBe("Usuario o contraseña incorrectos.");
  });

  it("bloquea al 5.º intento, responde 423 aun con la contraseña correcta y se libera a los 15 minutos", async () => {
    const u = await crearUsuarioApi(m, admin, "farmacia");
    const estados: number[] = [];
    for (let i = 0; i < 5; i++) estados.push((await ingresar(m.app, u.nombre, "198.51.100.4", "Equivocada-123456")).r.status);
    expect(estados).toEqual([401, 401, 401, 401, 423]);
    const bien = await ingresar(m.app, u.nombre, "198.51.100.4", u.temporal);
    expect(bien.r.status).toBe(423); expect(bien.r.body.error.codigo).toBe("CUENTA_BLOQUEADA");
    await m.dueno.query("UPDATE usuarios SET bloqueado_hasta = now() - interval '1 minute' WHERE id_usuario = $1", [u.id]);
    // Pasado el bloqueo, un fallo cuenta como el primero (no vuelve a bloquear de inmediato)
    expect((await ingresar(m.app, u.nombre, "198.51.100.4", "Equivocada-123456")).r.status).toBe(401);
    expect((await m.dueno.query("SELECT intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id_usuario = $1", [u.id])).rows[0]).toMatchObject({ intentos_fallidos: 1, bloqueado_hasta: null });
    const ok = await ingresar(m.app, u.nombre, "198.51.100.4", u.temporal);
    expect(ok.r.status).toBe(200);
    expect((await m.dueno.query("SELECT intentos_fallidos FROM usuarios WHERE id_usuario = $1", [u.id])).rows[0].intentos_fallidos).toBe(0);
    const eventos = (await m.dueno.query("SELECT accion FROM bitacora WHERE id_registro = $1 AND accion IN ('bloqueo_cuenta') ", [u.id])).rowCount;
    expect(eventos).toBe(1);
  });

  it("la sesión vence a los 16 minutos de inactividad y queda anotado", async () => {
    const { cookie } = await ingresar(m.app, "pnutricion", "198.51.100.5");
    expect((await get(m.app, "/api/yo", cookie)).status).toBe(200);
    await m.dueno.query("UPDATE sesiones SET fecha_hora_ultima_actividad = now() - interval '16 minutes' WHERE id_sesion = $1", [await sesionDe("pnutricion")]);
    const r = await get(m.app, "/api/yo", cookie);
    expect(r.status).toBe(401); expect(r.body.error.codigo).toBe("SESION_EXPIRADA");
    expect((await get(m.app, "/api/yo", cookie)).body.error.codigo).toBe("NO_AUTENTICADO");
    const e = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'sesion_expirada' AND id_usuario = $1", [await idUsuarioDe(m.dueno, "pnutricion")]);
    expect(e.rows[0].n).toBe(1);
  });

  it("la actividad dentro de 15 minutos mantiene la sesión", async () => {
    const { cookie } = await ingresar(m.app, "pvacunacion", "198.51.100.6");
    await m.dueno.query("UPDATE sesiones SET fecha_hora_ultima_actividad = now() - interval '14 minutes' WHERE id_sesion = $1", [await sesionDe("pvacunacion")]);
    const r = await get(m.app, "/api/yo", cookie);
    expect(r.status).toBe(200);
    expect(cookieDe(r)).toMatch(/sjlc_sesion=/); // se renueva la cookie
    const dif = await m.dueno.query("SELECT now() - fecha_hora_ultima_actividad < interval '1 minute' AS reciente FROM sesiones WHERE id_sesion = $1", [await sesionDe("pvacunacion")]);
    expect(dif.rows[0].reciente).toBe(true);
  });

  it("la sesión tiene una duración máxima aunque haya actividad", async () => {
    const { cookie } = await ingresar(m.app, "pdoctora", "198.51.100.7");
    await m.dueno.query("UPDATE sesiones SET fecha_hora_vence_absoluta = now() - interval '1 minute' WHERE id_sesion = $1", [await sesionDe("pdoctora")]);
    expect((await get(m.app, "/api/yo", cookie)).status).toBe(401);
  });

  it("salir revoca la sesión: el mismo token ya no sirve", async () => {
    const { cookie } = await ingresar(m.app, "precepcion", "198.51.100.8");
    const r = await post(m.app, "/api/autenticacion/salir", cookie);
    expect(r.status).toBe(200);
    expect(String((r.headers["set-cookie"] as unknown as string[])[0])).toMatch(/sjlc_sesion=;/);
    expect((await get(m.app, "/api/yo", cookie)).status).toBe(401);
    const e = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'cierre_sesion' AND id_usuario = $1", [await idUsuarioDe(m.dueno, "precepcion")]);
    expect(e.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("primer ingreso: obliga a cambiar la contraseña y la cambia revocando las otras sesiones", async () => {
    const u = await crearUsuarioApi(m, admin, "nutricion");
    const a = await ingresar(m.app, u.nombre, "198.51.100.9", u.temporal);
    const b = await ingresar(m.app, u.nombre, "198.51.100.9", u.temporal);
    expect(a.r.body.debe_cambiar_contrasena).toBe(true);
    const bloqueada = await get(m.app, "/api/usuarios", a.cookie);
    expect(bloqueada.status).toBe(403); expect(bloqueada.body.error.codigo).toBe("CAMBIO_CONTRASENA_OBLIGATORIO");
    const yo = await get(m.app, "/api/yo", a.cookie);
    expect(yo.status).toBe(200); expect(yo.body.debe_cambiar_contrasena).toBe(true);
    // Rechazos
    expect((await post(m.app, "/api/autenticacion/cambiar-contrasena", a.cookie, { contrasena_actual: "mala", contrasena_nueva: "Nueva-Clave-9137" })).status).toBe(403);
    expect((await post(m.app, "/api/autenticacion/cambiar-contrasena", a.cookie, { contrasena_actual: u.temporal, contrasena_nueva: "corta" })).body.error.codigo).toBe("CONTRASENA_NO_VALIDA");
    expect((await post(m.app, "/api/autenticacion/cambiar-contrasena", a.cookie, { contrasena_actual: u.temporal, contrasena_nueva: u.temporal })).status).toBe(422);
    expect((await post(m.app, "/api/autenticacion/cambiar-contrasena", a.cookie, { contrasena_actual: u.temporal, contrasena_nueva: `${u.nombre}9137xx` })).status).toBe(422);
    // Cambio correcto
    const c = await post(m.app, "/api/autenticacion/cambiar-contrasena", a.cookie, { contrasena_actual: u.temporal, contrasena_nueva: "Nueva-Clave-9137" });
    expect(c.status).toBe(200);
    expect((await get(m.app, "/api/yo", a.cookie)).body.debe_cambiar_contrasena).toBe(false);
    expect((await get(m.app, "/api/usuarios", a.cookie)).body.error.codigo).toBe("SIN_PERMISO"); // ya no está bloqueada por el cambio pendiente
    expect((await get(m.app, "/api/yo", b.cookie)).status).toBe(401); // la otra sesión se cerró
    expect((await ingresar(m.app, u.nombre, "198.51.100.9", u.temporal)).r.status).toBe(401);
    expect((await ingresar(m.app, u.nombre, "198.51.100.9", "Nueva-Clave-9137")).r.status).toBe(200);
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'cambio_contrasena' AND id_usuario = $1", [u.id])).rows[0].n).toBe(1);
  });

  it("CSRF: una petición que cambia datos desde otro origen se rechaza", async () => {
    const mala = await request(m.app).post("/api/autenticacion/ingresar").set("Origin", "https://evil.example").send({ usuario: "psignos", contrasena: CONTRASENA });
    expect(mala.status).toBe(403); expect(mala.body.error.codigo).toBe("ORIGEN_NO_PERMITIDO");
    const buena = await request(m.app).post("/api/autenticacion/ingresar").set("Host", "sistema.local").set("Origin", "http://sistema.local").set("X-Forwarded-For", "198.51.100.10").send({ usuario: "psignos", contrasena: CONTRASENA });
    expect(buena.status).toBe(200);
  });

  it("los errores no filtran SQL ni trazas", async () => {
    const json = await request(m.app).post("/api/autenticacion/ingresar").set("Content-Type", "application/json").send("{malo");
    expect(json.status).toBe(400); expect(json.body.error.codigo).toBe("JSON_INVALIDO");
    const extra = await request(m.app).post("/api/autenticacion/ingresar").send({ usuario: "psignos", contrasena: "x", admin: true });
    expect(extra.status).toBe(422);
    const grande = await request(m.app).post("/api/autenticacion/ingresar").send({ usuario: "psignos", contrasena: "x".repeat(150_000) });
    expect(grande.status).toBe(413);
    const noRuta = await get(m.app, "/api/no-existe", admin);
    expect(noRuta.status).toBe(404);
    for (const r of [json, extra, grande, noRuta]) expect(JSON.stringify(r.body)).not.toMatch(/SELECT|INSERT|stack|node_modules|postgres|pg_/i);
  });

  it("intentos de inyección SQL no cambian el comportamiento", async () => {
    expect((await ingresar(m.app, "' OR '1'='1", "198.51.100.11")).r.status).toBe(422);
    expect((await ingresar(m.app, "psignos", "198.51.100.11", "' OR '1'='1")).r.status).toBe(401);
    for (const q of ["' OR 1=1 --", "%'; DROP TABLE usuarios; --", "\\"]) {
      const r = await get(m.app, `/api/usuarios?q=${encodeURIComponent(q)}`, admin);
      expect(r.status).toBe(200); expect(r.body.total).toBe(0);
    }
    expect((await get(m.app, `/api/usuarios?rol=${encodeURIComponent("administrador' OR '1'='1")}`, admin)).body.total).toBe(0);
    expect((await get(m.app, "/api/usuarios/1%20OR%201=1", admin)).status).toBe(422);
    expect((await get(m.app, "/api/usuarios/1;DROP%20TABLE%20usuarios", admin)).status).toBe(422);
    expect((await m.dueno.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n).toBeGreaterThan(8);
  });

  it("cada evento queda en la bitácora con el usuario y la IP real", async () => {
    await ingresar(m.app, "pfarmacia", "198.51.100.12", "Contrasena-incorrecta-9");
    await ingresar(m.app, "pfarmacia", "198.51.100.12");
    const id = await idUsuarioDe(m.dueno, "pfarmacia");
    const r = await m.dueno.query("SELECT accion, id_usuario, host(direccion_ip) AS ip, nombre_usuario_intentado FROM bitacora WHERE direccion_ip = '198.51.100.12' ORDER BY id_bitacora");
    expect(r.rows.map((x) => x.accion)).toEqual(expect.arrayContaining(["inicio_sesion_fallido", "inicio_sesion"]));
    for (const f of r.rows) expect(f.id_usuario).toBe(id);
    expect(r.rows.find((x) => x.accion === "inicio_sesion_fallido").nombre_usuario_intentado).toBe("pfarmacia");
  });

  it("los accesos denegados quedan anotados", async () => {
    const { cookie } = await ingresar(m.app, "psignos", "198.51.100.13");
    expect((await get(m.app, "/api/usuarios", cookie, "198.51.100.13")).status).toBe(403);
    expect((await get(m.app, "/api/usuarios", undefined, "198.51.100.14")).status).toBe(401);
    const r = await m.dueno.query("SELECT id_usuario, host(direccion_ip) AS ip FROM bitacora WHERE accion = 'acceso_denegado' AND host(direccion_ip) IN ('198.51.100.13','198.51.100.14') ORDER BY id_bitacora");
    expect(r.rows).toEqual([{ id_usuario: await idUsuarioDe(m.dueno, "psignos"), ip: "198.51.100.13" }, { id_usuario: null, ip: "198.51.100.14" }]);
  });
});

describe.skipIf(!hayBd)("endurecimiento tras la revisión de seguridad", () => {
  let m: Montaje;
  beforeAll(() => { m = montar(); });
  afterAll(async () => { await m.cerrar(); });

  it("acceso_denegado no se infla variando la ruta: una fila por IP anónima cada 60 s", async () => {
    const antes = (await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'acceso_denegado' AND host(direccion_ip) = '198.51.103.5'")).rows[0].n;
    for (let i = 1; i <= 30; i++) await get(m.app, `/api/usuarios/${i}`, undefined, "198.51.103.5");
    await get(m.app, "/api/roles", undefined, "198.51.103.5");
    const despues = (await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'acceso_denegado' AND host(direccion_ip) = '198.51.103.5'")).rows[0].n;
    expect(despues - antes).toBe(1);
  });

  it("GET /api/yo sin sesión no deja fila en la bitácora", async () => {
    await get(m.app, "/api/yo", undefined, "198.51.103.6");
    const n = (await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'acceso_denegado' AND host(direccion_ip) = '198.51.103.6'")).rows[0].n;
    expect(n).toBe(0);
  });

  it("el origen no permitido y la contraseña actual incorrecta quedan anotados", async () => {
    await request(m.app).post("/api/autenticacion/ingresar").set("Origin", "https://evil.example").set("X-Forwarded-For", "198.51.103.7").send({ usuario: "psignos", contrasena: CONTRASENA });
    const { cookie } = await ingresar(m.app, "pfarmacia", "198.51.103.8");
    await post(m.app, "/api/autenticacion/cambiar-contrasena", cookie, { contrasena_actual: "Equivocada-123456", contrasena_nueva: "Nueva-Clave-9137" }, "198.51.103.8");
    const r = await m.dueno.query("SELECT detalle FROM bitacora WHERE accion = 'acceso_denegado' AND host(direccion_ip) IN ('198.51.103.7','198.51.103.8') ORDER BY id_bitacora");
    expect(r.rows.map((x) => x.detalle).join("|")).toMatch(/origen no permitido.*contraseña actual incorrecta/);
  });

  it("al vencer la duración máxima la sesión se revoca y queda anotado", async () => {
    const { cookie } = await ingresar(m.app, "pvacunacion", "198.51.103.9");
    const id = (await m.dueno.query("SELECT id_sesion FROM sesiones s JOIN usuarios u USING (id_usuario) WHERE u.nombre_usuario = 'pvacunacion' ORDER BY fecha_hora_inicio DESC LIMIT 1")).rows[0].id_sesion;
    await m.dueno.query("UPDATE sesiones SET fecha_hora_vence_absoluta = now() - interval '1 minute' WHERE id_sesion = $1", [id]);
    const r = await get(m.app, "/api/yo", cookie);
    expect(r.status).toBe(401); expect(r.body.error.codigo).toBe("SESION_EXPIRADA");
    const s = await m.dueno.query("SELECT revocada_en IS NOT NULL AS revocada FROM sesiones WHERE id_sesion = $1", [id]);
    expect(s.rows[0].revocada).toBe(true);
    const e = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE accion = 'sesion_expirada' AND detalle = 'por duración máxima'");
    expect(e.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("el límite general por sesión no depende de la IP compartida del centro", async () => {
    const m2 = montar({ LIMITE_GENERAL: "5" });
    try {
      const a = (await ingresar(m2.app, "pdoctor", "198.51.103.20")).cookie!;
      const b = (await ingresar(m2.app, "pdoctora", "198.51.103.20")).cookie!;
      const estadosA: number[] = [];
      for (let i = 0; i < 8; i++) estadosA.push((await get(m2.app, "/api/yo", a, "198.51.103.20")).status);
      expect(estadosA).toContain(429);
      expect((await get(m2.app, "/api/yo", b, "198.51.103.20")).status).toBe(200); // otra sesión, misma IP
    } finally { await m2.cerrar(); }
  });
});
