import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { TIPOS_REPORTE, generarReporte } from "./servicio.js";

const esquema = z.object({ desde: z.iso.date(), hasta: z.iso.date(), agrupar: z.enum(["day", "month"]).default("day") }).strict();

export function rutasReportes(registro: RegistroRutas, deps: Dependencias): void {
  registro.agregar({ metodo: "get", ruta: "/api/reportes/:tipo", acceso: { permiso: "administracion" },
    esquema: { params: z.object({ tipo: z.enum(TIPOS_REPORTE) }), consulta: esquema },
    manejador: async (req, res) => {
      res.json(await generarReporte(deps.pool, { idUsuario: req.usuario!.idUsuario, ip: ipCliente(req) }, req.validado.params.tipo, req.validado.consulta));
    } });
}
