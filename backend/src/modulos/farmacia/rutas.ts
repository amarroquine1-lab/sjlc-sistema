import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import type { UsuarioActor } from "../cola/servicio.js";
import { registrarEntrega } from "./servicio.js";

const idEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const esquemaEntrega = z.object({
  finalizar: z.boolean().optional(),
  recibido_por: z.string().trim().max(120).nullish().transform((v) => (v ? v : null)),
  lineas: z.array(z.object({
    id_receta_detalle: z.number().int().positive().max(2147483647), cantidad_entregada: z.number().int().min(0).max(999),
    observacion: z.string().trim().max(300).nullish().transform((v) => (v ? v : null)),
  }).strict()).min(1).max(40),
}).strict();

export function rutasFarmacia(registro: RegistroRutas, deps: Dependencias): void {
  const { pool } = deps;
  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/entregas", acceso: { permiso: "entrega_medicamentos" }, esquema: { params: idEsq, cuerpo: esquemaEntrega },
    manejador: async (req, res) => {
      const actor: UsuarioActor = { idUsuario: req.usuario!.idUsuario, ip: ipCliente(req), rol: req.usuario!.rol, area: req.usuario!.area };
      res.status(201).json(await registrarEntrega(pool, actor, req.validado.params.id, req.validado.cuerpo, req.validado.cuerpo.finalizar === true));
    } });
}
