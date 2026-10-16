import { z } from "zod";
import { ErrorApi } from "../../comun/errores.js";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { detalleBitacora, estadoColas, listarBitacora, opcionesBitacora } from "../administracion/servicio.js";
import { historialPaciente } from "./servicio.js";

const id = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const fecha = z.iso.date();
const esquemaBitacora = z.object({
  usuario: z.string().trim().max(60).optional(), accion: z.string().trim().max(40).optional(), entidad: z.string().trim().max(40).optional(),
  id_registro: z.coerce.number().int().positive().max(9007199254740991).optional(), desde: fecha.optional(), hasta: fecha.optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1), por_pagina: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export function rutasHistorial(registro: RegistroRutas, deps: Dependencias): void {
  const { pool } = deps;
  registro.agregar({ metodo: "get", ruta: "/api/pacientes/:id/historial", acceso: { permiso: "ver_historial" },
    esquema: { params: id, consulta: z.object({ pagina: z.coerce.number().int().min(1).max(100000).default(1), por_pagina: z.coerce.number().int().min(1).max(30).default(10) }).strict() },
    manejador: async (req, res) => {
      res.json(await historialPaciente(pool, { idUsuario: req.usuario!.idUsuario, ip: ipCliente(req) }, req.validado.params.id, req.validado.consulta.pagina, req.validado.consulta.por_pagina));
    } });
  registro.agregar({ metodo: "get", ruta: "/api/bitacora", acceso: { permiso: "administracion" }, esquema: { consulta: esquemaBitacora },
    manejador: async (req, res) => { res.json(await listarBitacora(pool, req.validado.consulta)); } });
  registro.agregar({ metodo: "get", ruta: "/api/bitacora/opciones", acceso: { permiso: "administracion" }, manejador: async (_req, res) => { res.json(await opcionesBitacora(pool)); } });
  registro.agregar({ metodo: "get", ruta: "/api/bitacora/:id", acceso: { permiso: "administracion" }, esquema: { params: id },
    manejador: async (req, res) => {
      const d = await detalleBitacora(pool, req.validado.params.id);
      if (!d) throw new ErrorApi(404, "NO_ENCONTRADO", "No existe ese registro de la bitácora.");
      res.json(d);
    } });
  registro.agregar({ metodo: "get", ruta: "/api/administracion/colas", acceso: { permiso: "administracion" }, manejador: async (_req, res) => { res.json(await estadoColas(pool)); } });
}
