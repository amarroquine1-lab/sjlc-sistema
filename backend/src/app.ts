import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type pg from "pg";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { ErrorApi, manejadorErrores } from "./comun/errores.js";
import type { Configuracion } from "./configuracion.js";
import {
  crearAutenticar, crearAutorizar, exigirCambioContrasena, limitadorGeneral, verificarOrigen, type Dependencias,
} from "./middleware/seguridad.js";
import { rutasAutenticacion } from "./modulos/autenticacion/rutas.js";
import { rutasCola } from "./modulos/cola/rutas.js";
import { rutasConsulta } from "./modulos/consulta/rutas.js";
import { rutasFarmacia } from "./modulos/farmacia/rutas.js";
import { rutasHistorial } from "./modulos/historial/rutas.js";
import { rutasReportes } from "./modulos/reportes/rutas.js";
import { rutasNutricionVacunacion } from "./modulos/nutricion/rutas.js";
import { rutasPacientes } from "./modulos/pacientes/rutas.js";
import { rutasSistema } from "./modulos/sistema/rutas.js";
import { rutasUsuarios } from "./modulos/usuarios/rutas.js";
import { nuevoRouter, RegistroRutas } from "./seguridad/rutas.js";

export interface ResultadoApp { app: Express; registro: RegistroRutas }

// Todos los módulos se registran aquí; las fases siguientes agregan los suyos.
export function registrarModulos(registro: RegistroRutas, deps: Dependencias): void {
  rutasSistema(registro, deps);
  rutasAutenticacion(registro, deps);
  rutasUsuarios(registro, deps);
  rutasPacientes(registro, deps);
  rutasCola(registro, deps);
  rutasConsulta(registro, deps);
  rutasFarmacia(registro, deps);
  rutasHistorial(registro, deps);
  rutasReportes(registro, deps);
  rutasNutricionVacunacion(registro, deps);
}

export function crearApp(config: Configuracion, pool: pg.Pool, opciones: { silencioso?: boolean } = {}): ResultadoApp {
  const deps: Dependencias = { config, pool };
  const app = express();
  app.disable("x-powered-by");
  // Solo se confía en X-Forwarded-For si la conexión directa viene de una red interna (Nginx).
  app.set("trust proxy", config.proxyConfiable);

  const logger = pino({
    level: opciones.silencioso || config.entorno === "pruebas" ? "silent" : "info",
    redact: { paths: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']", "*.contrasena", "*.contrasena_actual", "*.contrasena_nueva"], censor: "[oculto]" },
  });
  app.use(pinoHttp({ logger, serializers: { req: (r) => ({ metodo: r.method, url: String(r.url).split("?")[0] }), res: (r) => ({ estado: r.statusCode }) } }));
  app.use(helmet());
  app.use(cors({
    origin: (origen, cb) => cb(null, !origen || config.origenesPermitidos.includes(origen)),
    credentials: true,
  }));
  // Datos clínicos en computadoras compartidas: ninguna respuesta de la API se guarda en caché.
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use(cookieParser());
  app.use(limitadorGeneral(config));
  app.use(express.json({ limit: "100kb", strict: true }));
  app.use(verificarOrigen(deps));

  const registro = new RegistroRutas();
  registrarModulos(registro, deps);
  const router = nuevoRouter();
  registro.montar(router, { autenticar: crearAutenticar(deps), exigirCambioContrasena, autorizar: crearAutorizar(deps) });
  app.use(router);

  app.use("/api", (_req, _res, next) => next(new ErrorApi(404, "RUTA_NO_ENCONTRADA", "La ruta solicitada no existe.")));
  app.use(manejadorErrores);
  return { app, registro };
}
