import { type APIRequestContext, type Page, expect, request } from "@playwright/test";

export const CONTRASENA = process.env.PRUEBAS_CONTRASENA ?? "";
export const BASE = process.env.URL_BASE ?? "http://localhost:18080";

export async function ingresarPorPantalla(page: Page, usuario: string, contrasena = CONTRASENA) {
  await page.goto("/ingreso");
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Contraseña", { exact: true }).fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

// Sesión de administrador por la API, para preparar datos de prueba.
export async function apiAdmin(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.77" } });
  const r = await ctx.post("/api/autenticacion/ingresar", { data: { usuario: "padmin", contrasena: CONTRASENA } });
  expect(r.ok()).toBeTruthy();
  return ctx;
}

let n = 0;
export async function crearUsuario(admin: APIRequestContext, rol: number, nombres = "Prueba"): Promise<{ nombre: string; temporal: string }> {
  n++;
  const sufijo = Array.from(String(Date.now()) + n, (d) => "abcdefghij"[Number(d)]).join("").slice(-8);
  const r = await admin.post("/api/usuarios", { data: { nombres, apellidos: `Equis${sufijo}`, id_rol: rol } });
  expect(r.status()).toBe(201);
  const j = await r.json();
  return { nombre: j.usuario.nombre_usuario, temporal: j.contrasena_temporal };
}

export async function idDeRol(admin: APIRequestContext, nombre: string): Promise<number> {
  const r = await admin.get("/api/roles");
  const roles = (await r.json()).datos as { id_rol: number; nombre_rol: string }[];
  return roles.find((x) => x.nombre_rol === nombre)!.id_rol;
}

export async function sinDesbordeHorizontal(page: Page) {
  const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(ancho.sw, "no debe haber desplazamiento horizontal").toBeLessThanOrEqual(ancho.cw);
}

// --- Preparación de datos por la API (sin pasar por pantalla) ---
export async function apiComo(usuario: string, ip = "198.51.100.88"): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "X-Forwarded-For": ip } });
  const r = await ctx.post("/api/autenticacion/ingresar", { data: { usuario, contrasena: CONTRASENA } });
  expect(r.ok(), `ingreso de ${usuario}`).toBeTruthy();
  return ctx;
}
export function cuiAleatorio(): string {
  for (;;) {
    const base = String(10000000 + Math.floor(Math.random() * 89999999));
    let t = 0; for (let i = 0; i < 8; i++) t += Number(base[i]) * (i + 2);
    if (t % 11 < 10) return `${base}${t % 11}0108`;
  }
}
export const sufijoLetras = (): string => Array.from(String(Date.now()) + Math.floor(Math.random() * 1000), (d) => "abcdefghij"[Number(d)]).join("").slice(-9);
export async function cerrarDia(admin: APIRequestContext) { expect((await admin.post("/api/administracion/cierre-del-dia")).ok()).toBeTruthy(); }
export async function pacienteConAtencion(recepcion: APIRequestContext, nombres = "Paciente", tipo = 1) {
  const apellidos = `Fila${sufijoLetras()}`;
  const fecha = new Date(Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 19000) * 86400000).toISOString().slice(0, 10);
  const p = await recepcion.post("/api/pacientes", { data: { nombres, apellidos, fecha_nacimiento: fecha, sexo: "F", cui: cuiAleatorio() } });
  expect(p.status()).toBe(201);
  const paciente = (await p.json()).paciente;
  const a = await recepcion.post("/api/atenciones", { data: { id_paciente: paciente.id_paciente, id_tipo_atencion: tipo } });
  expect(a.status()).toBe(201);
  const atencion = await a.json();
  return { nombres, apellidos, codigo: paciente.codigo_paciente as string, numero: atencion.numero_atencion as string, idAtencion: atencion.id_atencion as number };
}
export async function emergenciaApi(recepcion: APIRequestContext) {
  const r = await recepcion.post("/api/pacientes/emergencia", { data: { sexo: "M", edad_aproximada_anios: 30 } });
  expect(r.status()).toBe(201);
  const j = await r.json();
  return { idAtencion: j.id_atencion as number, numero: j.paciente.atencion_abierta.numero_atencion as string };
}
