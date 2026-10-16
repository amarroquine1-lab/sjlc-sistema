import { afterAll, describe, expect, it } from "vitest";
import { configuracion, get, hayBd, ingresar, montar, type Montaje } from "./ayudas.js";
import request from "supertest";

// CONDICIÓN DE ABNER: el límite por IP y la IP de la bitácora usan la IP REAL del cliente
// (la que Nginx reenvía desde CF-Connecting-IP), nunca la del contenedor web / proxy.
describe.skipIf(!hayBd)("IP real del cliente", () => {
  const montajes: Montaje[] = [];
  afterAll(async () => { for (const m of montajes) await m.cerrar(); });
  const nuevo = (extra: Record<string, string> = {}) => { const m = montar(extra); montajes.push(m); return m; };
  const desde = new Date(Date.now() - 1000);

  const fallar = (m: Montaje, usuario: string, cabecera?: string) => {
    const r = request(m.app).post("/api/autenticacion/ingresar");
    if (cabecera) r.set("X-Forwarded-For", cabecera);
    return r.send({ usuario, contrasena: "Contrasena-incorrecta-1" });
  };
  const ipsDeBitacora = async (m: Montaje, usuario: string) =>
    (await m.dueno.query("SELECT host(direccion_ip) AS ip FROM bitacora WHERE nombre_usuario_intentado = $1", [usuario])).rows.map((x) => x.ip);

  it("(a) con proxy confiable, la bitácora y la sesión guardan la IP del X-Forwarded-For", async () => {
    const m = nuevo();
    await fallar(m, "ipreala", "203.0.113.7");
    expect(await ipsDeBitacora(m, "ipreala")).toEqual(["203.0.113.7"]);
    const { r } = await ingresar(m.app, "psignos", "203.0.113.9");
    expect(r.status).toBe(200);
    const s = await m.dueno.query("SELECT host(direccion_ip) AS ip FROM sesiones ORDER BY fecha_hora_inicio DESC LIMIT 1");
    expect(s.rows[0].ip).toBe("203.0.113.9");
    const b = await m.dueno.query("SELECT host(direccion_ip) AS ip FROM bitacora WHERE accion = 'inicio_sesion' ORDER BY id_bitacora DESC LIMIT 1");
    expect(b.rows[0].ip).toBe("203.0.113.9");
  });

  it("(a) el límite cuenta por IP real: 20 fallos bloquean a esa IP y no a las demás (ni al proxy)", async () => {
    const m = nuevo({ LIMITE_FALLOS_IP: "20" });
    for (let i = 0; i < 20; i++) expect((await fallar(m, `limite${"abcdefghijklmnopqrstuvwxyz"[i]}`, "203.0.113.30")).status).toBe(401);
    const bloqueada = await fallar(m, "limiteuno", "203.0.113.30");
    expect(bloqueada.status).toBe(429); expect(bloqueada.body.error.codigo).toBe("DEMASIADOS_INTENTOS");
    expect(bloqueada.headers["retry-after"]).toBe("900");
    // otra IP real sigue pudiendo ingresar (no se bloquea al "contenedor web" que es el socket)
    expect((await fallar(m, "otraip", "203.0.113.31")).status).toBe(401);
    const ok = await ingresar(m.app, "psignos", "203.0.113.32");
    expect(ok.r.status).toBe(200);
    // la IP bloqueada no puede ni con la contraseña correcta
    expect((await ingresar(m.app, "psignos", "203.0.113.30")).r.status).toBe(429);
  });

  it("(b) sin ningún proxy confiable la cabecera se IGNORA y se usa la IP del socket", async () => {
    const m = nuevo({ PROXY_CONFIABLE: "false" });
    await fallar(m, "ipsinproxy", "203.0.113.50");
    const ips = await ipsDeBitacora(m, "ipsinproxy");
    expect(ips).toHaveLength(1);
    expect(ips[0]).not.toBe("203.0.113.50");
    expect(ips[0]).toBe("127.0.0.1");
  });

  it("(b) un X-Forwarded-For de una conexión que no viene de la red interna se ignora", async () => {
    const m = nuevo({ PROXY_CONFIABLE: "10.99.0.0/16" }); // el socket de la prueba (127.0.0.1) NO está en esa red
    await fallar(m, "ipotrared", "203.0.113.51");
    expect(await ipsDeBitacora(m, "ipotrared")).toEqual(["127.0.0.1"]);
  });

  it("(c) en una cadena de proxies se toma al cliente real y nunca la IP del proxy ni la falsa de la izquierda", async () => {
    const m = nuevo();
    await fallar(m, "ipcadenaa", "1.2.3.4, 203.0.113.60");
    await fallar(m, "ipcadenab", "1.2.3.4, 203.0.113.61, 10.0.0.5");
    await fallar(m, "ipcadenac", "6.6.6.6");
    expect(await ipsDeBitacora(m, "ipcadenaa")).toEqual(["203.0.113.60"]);
    expect(await ipsDeBitacora(m, "ipcadenab")).toEqual(["203.0.113.61"]);
    expect(await ipsDeBitacora(m, "ipcadenac")).toEqual(["6.6.6.6"]);
  });

  it("(c) IPv6 y direcciones mapeadas se normalizan", async () => {
    const m = nuevo();
    await fallar(m, "ipsexa", "2001:db8::7");
    await fallar(m, "ipsexb", "::ffff:203.0.113.70");
    expect(await ipsDeBitacora(m, "ipsexa")).toEqual(["2001:db8::7"]);
    expect(await ipsDeBitacora(m, "ipsexb")).toEqual(["203.0.113.70"]);
  });

  it("(d) ninguna fila nueva de bitácora ni de sesiones tiene la IP del socket cuando llegó X-Forwarded-For", async () => {
    const m = nuevo();
    await ingresar(m.app, "pfarmacia", "203.0.113.80");
    await fallar(m, "ipsocket", "203.0.113.81");
    await get(m.app, "/api/usuarios", undefined, "203.0.113.82");
    const b = await m.dueno.query("SELECT count(*)::int AS n FROM bitacora WHERE host(direccion_ip) IN ('127.0.0.1') AND fecha_hora >= $1 AND accion IN ('inicio_sesion','inicio_sesion_fallido','acceso_denegado') AND nombre_usuario_intentado IS DISTINCT FROM 'ipsinproxy' AND nombre_usuario_intentado IS DISTINCT FROM 'ipotrared'", [desde]);
    const s = await m.dueno.query("SELECT count(*)::int AS n FROM sesiones WHERE host(direccion_ip) = '127.0.0.1' AND fecha_hora_inicio >= $1", [desde]);
    expect(b.rows[0].n).toBe(0);
    expect(s.rows[0].n).toBe(0);
  });

  it("la configuración por omisión solo confía en redes internas", () => {
    expect(configuracion({ PROXY_CONFIABLE: "" }).proxyConfiable).toEqual(["loopback", "uniquelocal"]);
  });
});
