import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";
import type pg from "pg";
import { rateLimit } from "express-rate-limit";
import { registrarEvento } from "../bitacora/servicio.js";
import { ErrorApi } from "../comun/errores.js";
import { ipCliente } from "../comun/ip.js";
import type { Configuracion } from "../configuracion.js";
import { type Accion, rolTienePermiso } from "../seguridad/permisos.js";
import { leerSesion, revocarSesion, tocarActividad } from "../seguridad/sesiones.js";
import { firmarToken, leerToken, NOMBRE_COOKIE } from "../seguridad/token.js";

export interface Dependencias {
  config: Configuracion;
  pool: pg.Pool;
}

export function opcionesCookie(): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: "strict", path: "/api" };
}

export function fijarCookie(res: Response, config: Configuracion, idUsuario: number, idSesion: string): void {
  res.cookie(NOMBRE_COOKIE, firmarToken({ idUsuario, idSesion }, config.jwtSecreto), opcionesCookie());
}

export function borrarCookie(res: Response): void {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie());
}

// Los 401 y 403 se anotan sin inundar la bitácora (no se borra): con usuario, una vez por IP, ruta (patrón)
// y usuario cada 10 s; sin sesión, una vez por IP cada 60 s y nunca para GET /api/yo (la pantalla de ingreso lo consulta).
const ultimaAnotacion = new Map<string, number>();
export async function anotarDenegado(deps: Dependencias, req: Request, motivo: string): Promise<void> {
  const ip = ipCliente(req);
  const patron = (req.route?.path as string | undefined) ?? "(sin ruta)";
  if (!req.usuario && req.method === "GET" && patron === "/api/yo") return;
  const ventana = req.usuario ? 10_000 : 60_000;
  const clave = req.usuario ? `${ip}|${req.method}|${patron}|${req.usuario.idUsuario}` : `${ip}|anonimo`;
  const ahora = Date.now();
  if ((ultimaAnotacion.get(clave) ?? 0) > ahora - ventana) return;
  ultimaAnotacion.set(clave, ahora);
  if (ultimaAnotacion.size > 5000) for (const [k, t] of ultimaAnotacion) if (t < ahora - 60_000) ultimaAnotacion.delete(k);
  try {
    await registrarEvento(deps.pool, {
      accion: "acceso_denegado", entidad: "api", idUsuario: req.usuario?.idUsuario ?? null,
      detalle: `${req.method} ${patron}: ${motivo}`.slice(0, 300), direccionIp: ip,
    });
  } catch (error) {
    req.log?.warn({ err: (error as Error).message }, "no se pudo anotar acceso_denegado");
  }
}

export function crearAutenticar(deps: Dependencias): RequestHandler {
  return async (req, res, next) => {
    try {
      const rechazar = async (estado: number, codigo: string, mensaje: string, motivo: string) => {
        await anotarDenegado(deps, req, motivo);
        throw new ErrorApi(estado, codigo, mensaje);
      };
      const token = req.cookies?.[NOMBRE_COOKIE];
      if (typeof token !== "string" || token === "") return await rechazar(401, "NO_AUTENTICADO", "Debe iniciar sesión.", "sin sesión");
      const leido = leerToken(token, deps.config.jwtSecreto);
      if (leido.estado === "invalido") return await rechazar(401, "NO_AUTENTICADO", "Debe iniciar sesión.", "token inválido");

      const sesion = await leerSesion(deps.pool, leido.datos.idSesion, deps.config.minutosInactividad);
      if (sesion && !sesion.revocada && sesion.usuarioActivo && !sesion.vigenteAbsoluta) {
        await revocarSesion(deps.pool, sesion.idSesion, "desconocido");
        await registrarEvento(deps.pool, {
          accion: "sesion_expirada", entidad: "sesiones", idUsuario: sesion.idUsuario, direccionIp: ipCliente(req), detalle: "por duración máxima",
        });
        borrarCookie(res);
        throw new ErrorApi(401, "SESION_EXPIRADA", "Su sesión alcanzó la duración máxima. Inicie sesión de nuevo.");
      }
      if (!sesion || sesion.idUsuario !== leido.datos.idUsuario || sesion.revocada || !sesion.usuarioActivo || !sesion.vigenteAbsoluta) {
        borrarCookie(res);
        return await rechazar(401, "NO_AUTENTICADO", "Debe iniciar sesión.", "sesión no válida");
      }
      if (leido.estado === "expirado" || !sesion.activa) {
        await revocarSesion(deps.pool, sesion.idSesion, "inactividad");
        await registrarEvento(deps.pool, {
          accion: "sesion_expirada", entidad: "sesiones", idUsuario: sesion.idUsuario, direccionIp: ipCliente(req),
          detalle: "por inactividad",
        });
        borrarCookie(res);
        throw new ErrorApi(401, "SESION_EXPIRADA", "Su sesión expiró por inactividad. Inicie sesión de nuevo.");
      }
      // Las peticiones automáticas (sondeo de la cola) no cuentan como actividad: si nadie trabaja, la sesión vence a los 15 minutos.
      const automatica = req.get("x-actividad") === "automatica";
      if (sesion.debeRenovar && !automatica) {
        await tocarActividad(deps.pool, sesion.idSesion);
        fijarCookie(res, deps.config, sesion.idUsuario, sesion.idSesion);
      }
      req.idSesion = sesion.idSesion;
      req.usuario = {
        idUsuario: sesion.idUsuario, nombreUsuario: sesion.nombreUsuario, nombres: sesion.nombres, apellidos: sesion.apellidos,
        idRol: sesion.idRol, rol: sesion.rol, area: sesion.area, debeCambiarContrasena: sesion.debeCambiarContrasena,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const exigirCambioContrasena: RequestHandler = (req, _res, next) => {
  if (req.usuario?.debeCambiarContrasena) {
    return next(new ErrorApi(403, "CAMBIO_CONTRASENA_OBLIGATORIO", "Debe cambiar su contraseña antes de continuar."));
  }
  next();
};

export function crearAutorizar(deps: Dependencias): (accion: Accion) => RequestHandler {
  return (accion) => async (req, _res, next) => {
    try {
      if (!req.usuario || !rolTienePermiso(req.usuario.rol, accion)) {
        await anotarDenegado(deps, req, `sin permiso (${accion})`);
        throw new ErrorApi(403, "SIN_PERMISO", "No tiene permiso para realizar esta acción.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// CSRF: además de SameSite=Strict, una petición que cambia datos debe venir del propio sitio.
export function verificarOrigen(deps: Dependencias): RequestHandler {
  const config = deps.config;
  return (req: Request, _res: Response, next: NextFunction) => {
    const rechazar = () => {
      void anotarDenegado(deps, req, "origen no permitido");
      next(new ErrorApi(403, "ORIGEN_NO_PERMITIDO", "Origen de la petición no permitido."));
    };
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origen = req.get("origin");
    if (!origen) return next();
    let host: string;
    try {
      host = new URL(origen).host;
    } catch {
      return rechazar();
    }
    if (host === req.get("host") || config.origenesPermitidos.includes(origen)) return next();
    rechazar();
  };
}

function clavePorSesion(config: Configuracion) {
  return (req: unknown) => {
    const r = req as Request;
    const token = r.cookies?.[NOMBRE_COOKIE];
    const leido = typeof token === "string" ? leerToken(token, config.jwtSecreto) : null;
    return leido && leido.estado === "valido" ? `s:${leido.datos.idSesion}` : (ipCliente(r) ?? "desconocida");
  };
}

const esAutomatica = (req: unknown) => (req as Request).get("x-actividad") === "automatica" && (req as Request).method === "GET";

// Las peticiones automáticas (sondeo de la cola) tienen su propio límite para no gastar el de las acciones del usuario.
export function limitadorGeneral(config: Configuracion): RequestHandler {
  const comun = { standardHeaders: "draft-7" as const, legacyHeaders: false, validate: false, keyGenerator: clavePorSesion(config),
    handler: (_req: unknown, _res: unknown, next: (e?: unknown) => void) => next(new ErrorApi(429, "DEMASIADAS_PETICIONES", "Demasiadas peticiones. Espere un momento.")) };
  const usuario = rateLimit({ ...comun, windowMs: 15 * 60 * 1000, limit: config.limiteGeneral, skip: esAutomatica });
  const sondeo = rateLimit({ ...comun, windowMs: 60 * 1000, limit: 60, skip: (req) => !esAutomatica(req) });
  return (req, res, next) => usuario(req, res, (e) => (e ? next(e) : sondeo(req, res, next)));
}
