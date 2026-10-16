import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hayBd, ingresar, montar, type Montaje } from "./ayudas.js";
import request from "supertest";
import { ROLES, rolTienePermiso } from "../../src/seguridad/permisos.js";
import type { DefinicionRuta } from "../../src/seguridad/rutas.js";

const USUARIOS: Record<string, string> = {
  administrador: "padmin", recepcion: "precepcion", signos: "psignos", doctor: "pdoctor",
  nutricion: "pnutricion", vacunacion: "pvacunacion", farmacia: "pfarmacia",
};

// Para CADA ruta registrada × CADA identidad (sin sesión + los 7 roles) se comprueba 401, 403 o "pasó la autorización".
describe.skipIf(!hayBd)("matriz de permisos: rol × ruta", () => {
  let m: Montaje;
  const cookies: Record<string, string> = {};
  beforeAll(async () => {
    m = montar();
    let n = 10;
    for (const [rol, u] of Object.entries(USUARIOS)) cookies[rol] = (await ingresar(m.app, u, `198.51.102.${n++}`)).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });

  const llamar = async (def: DefinicionRuta, cookie?: string) => {
    const ruta = def.ruta.replace(":id", "999999");
    const r = request(m.app)[def.metodo](ruta).set("X-Forwarded-For", "198.51.102.200");
    if (cookie) r.set("Cookie", cookie);
    return def.metodo === "get" ? r : r.send({});
  };

  it("todas las rutas declaran su acceso", () => {
    expect(m.registro.rutas.length).toBeGreaterThanOrEqual(14);
    for (const def of m.registro.rutas) expect(def.acceso, `${def.metodo} ${def.ruta}`).toBeTruthy();
  });

  it("sin sesión: 401 en todas las rutas no públicas", async () => {
    for (const def of m.registro.rutas.filter((d) => d.acceso !== "publica")) {
      const r = await llamar(def);
      expect(r.status, `${def.metodo.toUpperCase()} ${def.ruta} sin sesión`).toBe(401);
    }
  });

  it("las rutas públicas no exigen sesión", async () => {
    for (const def of m.registro.rutas.filter((d) => d.acceso === "publica")) {
      const r = await llamar(def);
      expect([401, 403], `${def.metodo.toUpperCase()} ${def.ruta}`).not.toContain(r.status);
    }
  });

  for (const rol of ROLES) {
    it(`rol ${rol}: 403 donde no tiene permiso y acceso donde sí`, async () => {
      for (const def of m.registro.rutas.filter((d) => d.acceso !== "publica")) {
        // salir revoca la sesión: se prueba con una sesión propia
        const cookie = def.ruta.endsWith("/salir") ? (await ingresar(m.app, USUARIOS[rol], "198.51.102.201")).cookie! : cookies[rol];
        const r = await llamar(def, cookie);
        const permitido = typeof def.acceso === "object" ? rolTienePermiso(rol, def.acceso.permiso) : true;
        const etiqueta = `${rol} → ${def.metodo.toUpperCase()} ${def.ruta}`;
        if (permitido) expect([401, 403, 500], etiqueta).not.toContain(r.status);
        else { expect(r.status, etiqueta).toBe(403); expect(r.body.error.codigo, etiqueta).toBe("SIN_PERMISO"); }
      }
    });
  }

  it("una cookie falsificada o ajena no entra a ninguna ruta", async () => {
    for (const def of m.registro.rutas.filter((d) => d.acceso !== "publica")) {
      const r = await llamar(def, "sjlc_sesion=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.");
      expect(r.status, `${def.metodo} ${def.ruta}`).toBe(401);
    }
  });
});
