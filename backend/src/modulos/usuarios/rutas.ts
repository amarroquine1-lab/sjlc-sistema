import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { cambiarEstado, crearUsuario, desbloquear, editarUsuario, listarRoles, listarUsuarios, obtenerUsuario, restablecerContrasena } from "./servicio.js";

const id = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const texto = z.string().trim().min(1).max(100);

const esquemaLista = z.object({
  q: z.string().trim().max(100).optional(),
  rol: z.string().trim().max(30).optional(),
  activo: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  por_pagina: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const esquemaCrear = z.object({
  nombres: texto, apellidos: texto, id_rol: z.number().int().positive(),
  nombre_usuario: z.string().min(2).max(30).regex(/^[a-z]+$/).optional(),
}).strict();

const esquemaEditar = z.object({
  nombres: texto.optional(), apellidos: texto.optional(), id_rol: z.number().int().positive().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

export function rutasUsuarios(registro: RegistroRutas, deps: Dependencias): void {
  const actor = (req: import("express").Request) => ({ idUsuario: req.usuario!.idUsuario, ip: ipCliente(req) });
  const admin = { permiso: "usuarios.administrar" } as const;

  registro.agregar({ metodo: "get", ruta: "/api/roles", acceso: { permiso: "roles.listar" },
    manejador: async (_req, res) => { res.json({ datos: await listarRoles(deps.pool) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/usuarios", acceso: admin, esquema: { consulta: esquemaLista },
    manejador: async (req, res) => { res.json(await listarUsuarios(deps.pool, req.validado.consulta)); } });
  registro.agregar({ metodo: "get", ruta: "/api/usuarios/:id", acceso: admin, esquema: { params: id },
    manejador: async (req, res) => { res.json(await obtenerUsuario(deps.pool, req.validado.params.id)); } });
  registro.agregar({ metodo: "post", ruta: "/api/usuarios", acceso: admin, esquema: { cuerpo: esquemaCrear },
    manejador: async (req, res) => { res.status(201).json(await crearUsuario(deps.pool, actor(req), req.validado.cuerpo)); } });
  registro.agregar({ metodo: "patch", ruta: "/api/usuarios/:id", acceso: admin, esquema: { params: id, cuerpo: esquemaEditar },
    manejador: async (req, res) => { res.json(await editarUsuario(deps.pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/usuarios/:id/desactivar", acceso: admin, esquema: { params: id },
    manejador: async (req, res) => { res.json(await cambiarEstado(deps.pool, actor(req), req.validado.params.id, false)); } });
  registro.agregar({ metodo: "post", ruta: "/api/usuarios/:id/activar", acceso: admin, esquema: { params: id },
    manejador: async (req, res) => { res.json(await cambiarEstado(deps.pool, actor(req), req.validado.params.id, true)); } });
  registro.agregar({ metodo: "post", ruta: "/api/usuarios/:id/restablecer-contrasena", acceso: admin, esquema: { params: id },
    manejador: async (req, res) => { res.json(await restablecerContrasena(deps.pool, actor(req), req.validado.params.id)); } });
  registro.agregar({ metodo: "post", ruta: "/api/usuarios/:id/desbloquear", acceso: admin, esquema: { params: id },
    manejador: async (req, res) => { res.json(await desbloquear(deps.pool, actor(req), req.validado.params.id)); } });
}
