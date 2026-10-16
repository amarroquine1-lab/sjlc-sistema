import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import type { UsuarioActor } from "../cola/servicio.js";
import { aplicarVacuna, cambiarEstadoVacuna, crearVacuna, listarVacunas, sugerirVacuna } from "../vacunacion/servicio.js";
import { guardarEvaluacion } from "./servicio.js";

const idEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const idVacEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647), idv: z.coerce.number().int().positive().max(2147483647) });
const texto = (max: number) => z.string().trim().min(1).max(max);
const opcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const esquemaEvaluacion = z.object({
  diagnostico_nutricional: texto(300),
  codigo_cie10: z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/, "Código CIE-10 no válido (ejemplo: E44.0)").nullish().transform((v) => v ?? null),
  observaciones: opcional(1000),
}).strict();

const esquemaVacuna = z.object({
  nombre_vacuna: z.string().trim().min(1, { error: "Escriba la vacuna" }).max(120), numero_dosis: z.number().int().min(1).max(20),
  lote: opcional(40), fecha_aplicacion: z.iso.date(),
}).strict();

// Nutrición (evaluación) y vacunación (catálogo y dosis aplicadas).
export function rutasNutricionVacunacion(registro: RegistroRutas, deps: Dependencias): void {
  const { pool } = deps;
  const actor = (req: import("express").Request): UsuarioActor => ({ idUsuario: req.usuario!.idUsuario, ip: ipCliente(req), rol: req.usuario!.rol, area: req.usuario!.area });

  registro.agregar({ metodo: "put", ruta: "/api/atenciones/:id/evaluacion-nutricional", acceso: { permiso: "evaluacion_nutricional" }, esquema: { params: idEsq, cuerpo: esquemaEvaluacion },
    manejador: async (req, res) => { res.json({ evaluacion: await guardarEvaluacion(pool, actor(req), req.validado.params.id, req.validado.cuerpo) }); } });

  registro.agregar({ metodo: "get", ruta: "/api/vacunas", acceso: { permiso: "registro_vacunas" }, manejador: async (_req, res) => { res.json({ datos: await listarVacunas(pool) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/vacunas/sugerencias", acceso: { permiso: "registro_vacunas" },
    esquema: { consulta: z.object({ q: z.string().trim().min(1).max(60) }).strict() },
    manejador: async (req, res) => { res.json({ datos: await sugerirVacuna(pool, req.validado.consulta.q) }); } });
  registro.agregar({ metodo: "post", ruta: "/api/vacunas", acceso: { permiso: "administracion" },
    esquema: { cuerpo: z.object({ nombre_vacuna: texto(120), dosis_totales: z.number().int().min(1).max(20).nullish() }).strict() },
    manejador: async (req, res) => { res.status(201).json(await crearVacuna(pool, actor(req), req.validado.cuerpo)); } });
  registro.agregar({ metodo: "patch", ruta: "/api/vacunas/:id", acceso: { permiso: "administracion" }, esquema: { params: idEsq, cuerpo: z.object({ activo: z.boolean() }).strict() },
    manejador: async (req, res) => { res.json(await cambiarEstadoVacuna(pool, actor(req), req.validado.params.id, req.validado.cuerpo.activo)); } });

  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/vacunas", acceso: { permiso: "registro_vacunas" }, esquema: { params: idEsq, cuerpo: esquemaVacuna },
    manejador: async (req, res) => { res.status(201).json(await aplicarVacuna(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "put", ruta: "/api/atenciones/:id/vacunas/:idv", acceso: { permiso: "registro_vacunas" }, esquema: { params: idVacEsq, cuerpo: esquemaVacuna },
    manejador: async (req, res) => { res.json(await aplicarVacuna(pool, actor(req), req.validado.params.id, req.validado.cuerpo, req.validado.params.idv)); } });
}
