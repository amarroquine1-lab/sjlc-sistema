import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { firmarToken, leerToken, SEGUNDOS_TOKEN } from "../../src/seguridad/token.js";

const SECRETO = "s".repeat(40);
const datos = { idUsuario: 7, idSesion: "7b3f6c0e-1b57-4d0e-9d2c-2f8f0f6b9a11" };

describe("token de sesión", () => {
  it("firma y verifica con HS256", () => {
    const t = firmarToken(datos, SECRETO);
    expect(jwt.decode(t, { complete: true })?.header.alg).toBe("HS256");
    expect(leerToken(t, SECRETO)).toEqual({ estado: "valido", datos });
  });
  it("vence a los 15 minutos", () => {
    const hace = Math.floor(Date.now() / 1000) - SEGUNDOS_TOKEN - 5;
    const r = leerToken(firmarToken(datos, SECRETO, hace), SECRETO);
    expect(r.estado).toBe("expirado");
  });
  it("rechaza un token alterado o con otra clave", () => {
    const t = firmarToken(datos, SECRETO);
    expect(leerToken(t.slice(0, -2) + "xx", SECRETO).estado).toBe("invalido");
    expect(leerToken(t, "otra".repeat(10)).estado).toBe("invalido");
  });
  it("rechaza el algoritmo none y otros algoritmos", () => {
    const sinFirma = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
      Buffer.from(JSON.stringify({ sub: "7", jti: datos.idSesion, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url") + ".";
    expect(leerToken(sinFirma, SECRETO).estado).toBe("invalido");
    const hs512 = jwt.sign({}, SECRETO, { algorithm: "HS512", subject: "7", jwtid: datos.idSesion, expiresIn: 600 });
    expect(leerToken(hs512, SECRETO).estado).toBe("invalido");
  });
  it("rechaza un token sin jti o con sub no numérico", () => {
    expect(leerToken(jwt.sign({}, SECRETO, { algorithm: "HS256", subject: "7", expiresIn: 600 }), SECRETO).estado).toBe("invalido");
    expect(leerToken(jwt.sign({}, SECRETO, { algorithm: "HS256", subject: "abc", jwtid: "x", expiresIn: 600 }), SECRETO).estado).toBe("invalido");
  });
});
