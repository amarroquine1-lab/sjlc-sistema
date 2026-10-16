import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import { crearApp } from "../../src/app.js";
import { conexionApp, conexionDueno } from "../../src/bd/conexion.js";
import { type Configuracion, leerConfiguracion } from "../../src/configuracion.js";
import type { RegistroRutas } from "../../src/seguridad/rutas.js";

// Las pruebas de integración necesitan la base desechable que prepara scripts/probar-backend.sh.
export const hayBd = Boolean(process.env.POSTGRES_DB && process.env.BD_CONTRASENA_APP && process.env.POSTGRES_PASSWORD);
export const CONTRASENA = process.env.PRUEBAS_CONTRASENA ?? "";

export function configuracion(extra: Record<string, string> = {}): Configuracion {
  return leerConfiguracion({
    ...process.env, JWT_SECRETO: process.env.JWT_SECRETO ?? "x".repeat(40), ENTORNO: "pruebas", LIMITE_GENERAL: "100000", ...extra,
  });
}

export interface Montaje { app: Express; registro: RegistroRutas; poolApp: pg.Pool; dueno: pg.Pool; cerrar: () => Promise<void> }

export function montar(extra: Record<string, string> = {}): Montaje {
  const poolApp = conexionApp();
  const dueno = conexionDueno();
  const { app, registro } = crearApp(configuracion(extra), poolApp);
  return { app, registro, poolApp, dueno, cerrar: async () => { await poolApp.end(); await dueno.end(); } };
}

export function cookieDe(r: request.Response): string | undefined {
  const c = r.headers["set-cookie"] as unknown as string[] | undefined;
  return c?.map((x) => x.split(";")[0]).join("; ");
}

export async function ingresar(app: Express, usuario: string, ip = "203.0.113.200", contrasena = CONTRASENA) {
  const r = await request(app).post("/api/autenticacion/ingresar").set("X-Forwarded-For", ip).send({ usuario, contrasena });
  return { r, cookie: cookieDe(r) };
}

export const get = (app: Express, ruta: string, cookie?: string, ip = "203.0.113.201") =>
  request(app).get(ruta).set("X-Forwarded-For", ip).set("Cookie", cookie ?? "");
export const post = (app: Express, ruta: string, cookie: string | undefined, cuerpo: unknown = {}, ip = "203.0.113.201") =>
  request(app).post(ruta).set("X-Forwarded-For", ip).set("Cookie", cookie ?? "").send(cuerpo as object);
export const patch = (app: Express, ruta: string, cookie: string | undefined, cuerpo: unknown = {}, ip = "203.0.113.201") =>
  request(app).patch(ruta).set("X-Forwarded-For", ip).set("Cookie", cookie ?? "").send(cuerpo as object);

export async function idRol(dueno: pg.Pool, nombre: string): Promise<number> {
  return (await dueno.query("SELECT id_rol FROM roles WHERE nombre_rol = $1", [nombre])).rows[0].id_rol;
}
export async function idUsuarioDe(dueno: pg.Pool, nombre: string): Promise<number> {
  return (await dueno.query("SELECT id_usuario FROM usuarios WHERE nombre_usuario = $1", [nombre])).rows[0].id_usuario;
}

let contador = 0;
// Crea un usuario por la API (como administrador) y devuelve sus datos y la contraseña temporal.
export async function crearUsuarioApi(m: Montaje, cookieAdmin: string, rol: string, nombres = "Prueba", apellidos?: string) {
  contador++;
  const sufijo = Array.from(String(Date.now()) + contador, (d) => "abcdefghij"[Number(d)]).join("").slice(-8);
  const r = await post(m.app, "/api/usuarios", cookieAdmin, { nombres, apellidos: apellidos ?? `Zeta${sufijo}`, id_rol: await idRol(m.dueno, rol) });
  if (r.status !== 201) throw new Error(`No se pudo crear el usuario de prueba: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.usuario.id_usuario as number, nombre: r.body.usuario.nombre_usuario as string, temporal: r.body.contrasena_temporal as string };
}

// --- Pacientes de prueba (recepción) ---
export function cuiNuevo(): string {
  for (;;) {
    const base = String(10000000 + Math.floor(Math.random() * 89999999));
    let t = 0; for (let i = 0; i < 8; i++) t += Number(base[i]) * (i + 2);
    if (t % 11 < 10) return `${base}${t % 11}0108`;
  }
}
let serie = 0;
export async function crearPaciente(m: Montaje, cookieRecepcion: string, ip = "203.0.113.150") {
  serie++;
  // Letras al azar y fecha en un rango amplio: el aviso de duplicados exige nombre parecido y misma fecha.
  const letras = Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
  const fecha = new Date(Date.UTC(1925, 0, 1) + Math.floor(Math.random() * 29000) * 86400000).toISOString().slice(0, 10);
  const r = await post(m.app, "/api/pacientes", cookieRecepcion, { nombres: "Paciente", apellidos: `Cola${letras}`, fecha_nacimiento: fecha, sexo: "F", cui: cuiNuevo() }, ip);
  if (r.status !== 201) throw new Error(`No se pudo crear el paciente: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.paciente as { id_paciente: number; codigo_paciente: string };
}
export async function abrirAtencion(m: Montaje, cookieRecepcion: string, idPaciente: number, idTipo = 1, ip = "203.0.113.150") {
  const r = await post(m.app, "/api/atenciones", cookieRecepcion, { id_paciente: idPaciente, id_tipo_atencion: idTipo }, ip);
  if (r.status !== 201) throw new Error(`No se pudo abrir la atención: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { id_atencion: number; numero_atencion: string };
}
export async function emergencia(m: Montaje, cookieRecepcion: string, ip = "203.0.113.150") {
  const r = await post(m.app, "/api/pacientes/emergencia", cookieRecepcion, { sexo: "M", edad_aproximada_anios: 40 }, ip);
  if (r.status !== 201) throw new Error(`No se pudo registrar la emergencia: ${r.status}`);
  return { id_atencion: r.body.id_atencion as number, id_paciente: r.body.paciente.id_paciente as number };
}
export const put = (app: Express, ruta: string, cookie: string | undefined, cuerpo: unknown = {}, ip = "203.0.113.201") =>
  request(app).put(ruta).set("X-Forwarded-For", ip).set("Cookie", cookie ?? "").send(cuerpo as object);
