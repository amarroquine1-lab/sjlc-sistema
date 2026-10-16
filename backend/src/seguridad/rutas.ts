import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { Router as crearRouter } from "express";
import type { ZodType } from "zod";
import type { Accion } from "./permisos.js";

export type Acceso = "publica" | "sesion" | { permiso: Accion };

export interface UsuarioSesion {
  idUsuario: number;
  nombreUsuario: string;
  nombres: string;
  apellidos: string;
  idRol: number;
  rol: string;
  area: string | null;
  debeCambiarContrasena: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSesion;
      idSesion?: string;
      validado: { cuerpo?: any; consulta?: any; params?: any };
    }
  }
}

export interface DefinicionRuta {
  metodo: "get" | "post" | "patch" | "put" | "delete";
  ruta: string;
  /** Obligatorio: una ruta sin acceso declarado no arranca. */
  acceso: Acceso;
  esquema?: { cuerpo?: ZodType; consulta?: ZodType; params?: ZodType };
  /** Se permite aunque el usuario deba cambiar su contraseña (solo yo, cambiar-contrasena y salir). */
  permiteCambioPendiente?: boolean;
  manejador: (req: Request, res: Response) => Promise<void> | void;
}

export type Cadena = {
  autenticar: RequestHandler;
  exigirCambioContrasena: RequestHandler;
  autorizar: (accion: Accion) => RequestHandler;
};

// Registro central: permite listar todas las rutas (prueba de matriz) y falla cerrado.
export class RegistroRutas {
  readonly rutas: DefinicionRuta[] = [];

  agregar(def: DefinicionRuta): void {
    if (!def.acceso) {
      throw new Error(`La ruta ${def.metodo.toUpperCase()} ${def.ruta} no declara su acceso.`);
    }
    if (this.rutas.some((r) => r.metodo === def.metodo && r.ruta === def.ruta)) {
      throw new Error(`Ruta repetida: ${def.metodo.toUpperCase()} ${def.ruta}.`);
    }
    this.rutas.push(def);
  }

  montar(router: Router, cadena: Cadena): void {
    for (const def of this.rutas) {
      const pasos: RequestHandler[] = [];
      if (def.acceso !== "publica") {
        pasos.push(cadena.autenticar);
        if (!def.permiteCambioPendiente) pasos.push(cadena.exigirCambioContrasena);
        if (typeof def.acceso === "object") pasos.push(cadena.autorizar(def.acceso.permiso));
      }
      pasos.push(validar(def));
      pasos.push(async (req, res, next: NextFunction) => {
        try {
          await def.manejador(req, res);
        } catch (error) {
          next(error);
        }
      });
      router[def.metodo](def.ruta, ...pasos);
    }
  }
}

function validar(def: DefinicionRuta): RequestHandler {
  return (req, _res, next) => {
    try {
      req.validado = {};
      if (def.esquema?.params) req.validado.params = def.esquema.params.parse(req.params);
      if (def.esquema?.consulta) req.validado.consulta = def.esquema.consulta.parse(req.query);
      if (def.esquema?.cuerpo) req.validado.cuerpo = def.esquema.cuerpo.parse(req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function nuevoRouter(): Router {
  return crearRouter();
}
