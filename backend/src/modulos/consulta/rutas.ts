import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import type { UsuarioActor } from "../cola/servicio.js";
import { cambiarEstadoMedicamento, crearMedicamento, sugerirReceta, guardarConsulta, guardarProximoControl, guardarReceta, listarMedicamentos } from "./servicio.js";

const idEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const texto = (max: number) => z.string({ error: "Este dato es obligatorio" }).trim().min(1, { error: "Este dato es obligatorio" }).max(max, { error: `Este dato no puede pasar de ${max} letras` });
const limpiar = (v: string) => v.replace(/\s+/g, " ");
const opcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const esquemaConsulta = z.object({
  tipo_consulta: z.enum(["primera", "reconsulta", "control"]),
  motivo_consulta: texto(500), historia_enfermedad: opcional(2000),
  semana_gestacion: z.number().int().min(1).max(42).nullish(),
  conducta_tratamiento: opcional(2000), problemas_identificados: opcional(1000), referido_a: opcional(200),
  diagnosticos: z.array(z.object({
    descripcion_diagnostico: texto(300),
    codigo_cie10: z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/, "Código CIE-10 no válido (ejemplo: J06.9)").nullish().transform((v) => v ?? null),
  }).strict()).max(10),
}).strict();

const esquemaReceta = z.object({
  lineas: z.array(z.object({
    medicamento: texto(120).transform(limpiar), presentacion: texto(60).transform(limpiar),
    cantidad_recetada: z.number({ error: "La cantidad debe ser un número" }).int({ error: "La cantidad debe ser un número entero" }).min(1, { error: "La cantidad debe estar entre 1 y 999" }).max(999, { error: "La cantidad debe estar entre 1 y 999" }),
    indicaciones: texto(300),
  }).strict()).max(20),
}).strict();

const esquemaControl = z.object({
  area: z.enum(["doctor", "nutricion", "vacunacion"]), descripcion: texto(200),
  fecha_sugerida: z.iso.date().nullish().transform((v) => v ?? null),
}).strict();

export function rutasConsulta(registro: RegistroRutas, deps: Dependencias): void {
  const { pool } = deps;
  const actor = (req: import("express").Request): UsuarioActor => ({ idUsuario: req.usuario!.idUsuario, ip: ipCliente(req), rol: req.usuario!.rol, area: req.usuario!.area });

  registro.agregar({ metodo: "put", ruta: "/api/atenciones/:id/consulta", acceso: { permiso: "diagnostico_conducta_control" }, esquema: { params: idEsq, cuerpo: esquemaConsulta },
    manejador: async (req, res) => { res.json(await guardarConsulta(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "put", ruta: "/api/atenciones/:id/receta", acceso: { permiso: "receta" }, esquema: { params: idEsq, cuerpo: esquemaReceta },
    manejador: async (req, res) => { res.json(await guardarReceta(pool, actor(req), req.validado.params.id, req.validado.cuerpo.lineas)); } });
  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/proximos-controles", acceso: { permiso: "proximo_control" }, esquema: { params: idEsq, cuerpo: esquemaControl },
    manejador: async (req, res) => { res.status(201).json(await guardarProximoControl(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "get", ruta: "/api/recetas/sugerencias", acceso: { permiso: "receta" },
    esquema: { consulta: z.object({ campo: z.enum(["medicamento", "presentacion"]), q: z.string().trim().min(1).max(60) }).strict() },
    manejador: async (req, res) => { res.json({ datos: await sugerirReceta(pool, req.validado.consulta.campo, req.validado.consulta.q) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/medicamentos", acceso: { permiso: "receta" }, esquema: { consulta: z.object({ q: z.string().trim().max(60).optional() }) },
    manejador: async (req, res) => { res.json({ datos: await listarMedicamentos(pool, req.validado.consulta.q || undefined) }); } });
  registro.agregar({ metodo: "patch", ruta: "/api/medicamentos/:id", acceso: { permiso: "administracion" }, esquema: { params: idEsq, cuerpo: z.object({ activo: z.boolean() }).strict() },
    manejador: async (req, res) => { res.json(await cambiarEstadoMedicamento(pool, actor(req), req.validado.params.id, req.validado.cuerpo.activo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/medicamentos", acceso: { permiso: "administracion" },
    esquema: { cuerpo: z.object({ nombre_medicamento: texto(120), presentacion: texto(60), concentracion: opcional(60) }).strict() },
    manejador: async (req, res) => { res.status(201).json(await crearMedicamento(pool, actor(req), req.validado.cuerpo)); } });
}
