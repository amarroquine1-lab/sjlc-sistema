import { describe, expect, it } from "vitest";
import { leerConfiguracion } from "../../src/configuracion.js";
import { RegistroRutas } from "../../src/seguridad/rutas.js";
import { calcularVerificadorScram } from "../../src/bd/utilidades.js";

const base = { JWT_SECRETO: "x".repeat(32), ENTORNO: "pruebas" };

describe("configuración", () => {
  it("el cierre automático del día solo se apaga con CIERRE_AUTOMATICO=no", () => {
    expect(leerConfiguracion(base).cierreAutomatico).toBe(true);
    expect(leerConfiguracion({ ...base, CIERRE_AUTOMATICO: "si" }).cierreAutomatico).toBe(true);
    expect(leerConfiguracion({ ...base, CIERRE_AUTOMATICO: "no" }).cierreAutomatico).toBe(false);
  });

  it("falla sin JWT_SECRETO o con uno corto", () => {
    expect(() => leerConfiguracion({ ENTORNO: "pruebas" })).toThrow(/JWT_SECRETO/);
    expect(() => leerConfiguracion({ ...base, JWT_SECRETO: "corto" })).toThrow(/JWT_SECRETO/);
  });
  it("falla con un ENTORNO inválido", () => {
    expect(() => leerConfiguracion({ ...base, ENTORNO: "otro" })).toThrow(/ENTORNO/);
  });
  it("por omisión confía solo en redes internas", () => {
    expect(leerConfiguracion(base).proxyConfiable).toEqual(["loopback", "uniquelocal"]);
    expect(leerConfiguracion({ ...base, PROXY_CONFIABLE: "false" }).proxyConfiable).toBe(false);
    expect(leerConfiguracion({ ...base, PROXY_CONFIABLE: "172.31.250.0/24, 10.0.0.1" }).proxyConfiable).toEqual(["172.31.250.0/24", "10.0.0.1"]);
  });
  it("lee los orígenes permitidos", () => {
    expect(leerConfiguracion({ ...base, ORIGENES_PERMITIDOS: "https://a.org, https://b.org" }).origenesPermitidos).toEqual(["https://a.org", "https://b.org"]);
  });
});

describe("registro de rutas (falla cerrado)", () => {
  it("una ruta sin acceso declarado no se puede registrar", () => {
    const r = new RegistroRutas();
    expect(() => r.agregar({ metodo: "get", ruta: "/api/x", manejador: () => undefined } as never)).toThrow(/no declara su acceso/);
  });
  it("no admite rutas repetidas", () => {
    const r = new RegistroRutas();
    r.agregar({ metodo: "get", ruta: "/api/x", acceso: "publica", manejador: () => undefined });
    expect(() => r.agregar({ metodo: "get", ruta: "/api/x", acceso: "publica", manejador: () => undefined })).toThrow(/repetida/);
  });
});

describe("verificador SCRAM-SHA-256 (S-08)", () => {
  it("tiene el formato de PostgreSQL y es reproducible con la misma sal", () => {
    const sal = Buffer.from("0123456789abcdef");
    const v = calcularVerificadorScram("una-clave", sal);
    expect(v).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(calcularVerificadorScram("una-clave", sal)).toBe(v);
    expect(calcularVerificadorScram("otra-clave", sal)).not.toBe(v);
    expect(v).not.toContain("una-clave");
  });
});
