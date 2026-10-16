import { z } from "zod";
import { ipCliente } from "../../comun/ip.js";
import { mayusculaInicial } from "../../servicios/texto.js";
import { registrarEvento } from "../../bitacora/servicio.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { abrirAtencion, datosTicket, listarAbiertas, listarTipos, marcarSeRetiro, obtenerAtencion } from "../atenciones/servicio.js";
import { catalogosFormulario, crearColonia, editarColonia, listarMunicipios } from "../catalogos/servicio.js";
import { agregarEncargado, buscarPacientes, editarPaciente, listarIncompletos, obtenerPaciente, registrarEmergencia, registrarPaciente, unirPacientes } from "./servicio.js";

const idEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
const nombre = z.string({ error: "Este nombre es obligatorio" }).trim().min(1, { error: "Este nombre es obligatorio" }).max(100, { error: "El nombre no puede pasar de 100 letras" })
  .regex(/^[\p{L}][\p{L}\s'.-]*$/u, { error: "El nombre solo puede llevar letras" }).transform(mayusculaInicial);
const fecha = z.string({ error: "La fecha de nacimiento es obligatoria" }).regex(/^\d{4}-\d{2}-\d{2}$/, { error: "La fecha debe escribirse completa (día, mes y año)" }).refine((v) => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); }, { error: "Esa fecha no existe" });
const cui = z.string().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{13}$/, { error: "El DPI/CUI debe tener 13 números" }));
const telefono = z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, { error: "El teléfono solo lleva números (de 7 a 20 caracteres)" });
const entero = z.number().int().positive();
const textoCorto = z.string().trim().min(1).max(200);

const encargado = z.object({ nombres: nombre, apellidos: nombre, dpi: cui.nullish(), telefono: telefono.nullish(), parentesco: z.string().trim().min(2).max(40) }).strict();

const esquemaPaciente = z.object({
  nombres: nombre, apellidos: nombre, fecha_nacimiento: fecha, sexo: z.enum(["F", "M"]), cui: cui.nullish(), sin_cui: z.boolean().optional(),
  telefono: telefono.nullish(), direccion: textoCorto.nullish(), id_municipio_residencia: entero.optional(), zona_residencia: entero.nullish(),
  id_colonia_sector: entero.nullish(), id_municipio_nacimiento: entero.nullish(), id_pueblo: entero.nullish(), id_comunidad_linguistica: entero.optional(),
  numero_registro_libro: z.string().trim().min(1).max(30).nullish(), confirmar_duplicado: z.boolean().optional(), encargado: encargado.nullish(),
}).strict();

const esquemaEdicion = z.object({
  nombres: nombre.optional(), apellidos: nombre.optional(), fecha_nacimiento: fecha.optional(), sexo: z.enum(["F", "M"]).optional(), cui: cui.nullish(),
  telefono: telefono.nullish(), direccion: textoCorto.nullish(), id_municipio_residencia: entero.optional(), zona_residencia: entero.nullish(),
  id_colonia_sector: entero.nullish(), id_municipio_nacimiento: entero.nullish(), id_pueblo: entero.nullish(), id_comunidad_linguistica: entero.optional(),
  numero_registro_libro: z.string().trim().min(1).max(30).nullish(), sin_cui: z.boolean().optional(), confirmar_duplicado: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

export function rutasPacientes(registro: RegistroRutas, deps: Dependencias): void {
  const actor = (req: import("express").Request) => ({ idUsuario: req.usuario!.idUsuario, ip: ipCliente(req) });
  const ver = { permiso: "ver_paciente" } as const;
  const registrar = { permiso: "registrar_paciente" } as const;
  const { pool, config } = deps;

  // Catálogos y configuración para los formularios
  registro.agregar({ metodo: "get", ruta: "/api/configuracion/centro", acceso: ver, manejador: (_req, res) => {
    res.json({ nombre: config.centro.nombre, id_departamento: config.centro.idDepartamento, id_municipio: config.centro.idMunicipio, zona: config.centro.zona });
  } });
  registro.agregar({ metodo: "get", ruta: "/api/catalogos/formulario", acceso: ver, manejador: async (_req, res) => { res.json(await catalogosFormulario(pool)); } });
  registro.agregar({ metodo: "get", ruta: "/api/catalogos/municipios", acceso: ver,
    esquema: { consulta: z.object({ q: z.string().trim().max(60).optional(), id_departamento: z.coerce.number().int().positive().optional() }).strict() },
    manejador: async (req, res) => { res.json({ datos: await listarMunicipios(pool, req.validado.consulta) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/catalogos/tipos-atencion", acceso: ver, manejador: async (_req, res) => { res.json({ datos: await listarTipos(pool) }); } });
  registro.agregar({ metodo: "post", ruta: "/api/colonias-sectores", acceso: { permiso: "administracion" },
    esquema: { cuerpo: z.object({ id_municipio: entero, zona: entero, nombre_colonia_sector: textoCorto, sector_centro: textoCorto.nullish() }).strict() },
    manejador: async (req, res) => { res.status(201).json(await crearColonia(pool, actor(req), req.validado.cuerpo)); } });
  registro.agregar({ metodo: "patch", ruta: "/api/colonias-sectores/:id", acceso: { permiso: "administracion" },
    esquema: { params: idEsq, cuerpo: z.object({ nombre_colonia_sector: textoCorto.optional(), sector_centro: textoCorto.nullish(), activo: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0) },
    manejador: async (req, res) => { res.json(await editarColonia(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });

  // Pacientes
  registro.agregar({ metodo: "get", ruta: "/api/pacientes/buscar", acceso: ver, esquema: { consulta: z.object({ q: z.string().trim().max(120) }).strict() },
    manejador: async (req, res) => {
      const r = await buscarPacientes(pool, req.validado.consulta.q);
      // Se anota quién busca y cuántos resultados obtuvo; nunca el texto buscado (puede ser un nombre o un DPI).
      await registrarEvento(pool, { accion: "buscar_paciente", entidad: "pacientes", idUsuario: req.usuario!.idUsuario, direccionIp: ipCliente(req), detalle: `${Array.isArray(r) ? r.length : (r as { datos?: unknown[] }).datos?.length ?? 0} resultado(s)` });
      res.json(r);
    } });
  registro.agregar({ metodo: "get", ruta: "/api/pacientes/incompletos", acceso: registrar, manejador: async (_req, res) => { res.json({ datos: await listarIncompletos(pool) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/pacientes/:id", acceso: ver, esquema: { params: idEsq },
    manejador: async (req, res) => {
      const p = await obtenerPaciente(pool, req.validado.params.id);
      await registrarEvento(pool, { accion: "ver_paciente", entidad: "pacientes", idRegistro: req.validado.params.id, idUsuario: req.usuario!.idUsuario, direccionIp: ipCliente(req) });
      res.json(p);
    } });
  registro.agregar({ metodo: "post", ruta: "/api/pacientes", acceso: registrar, esquema: { cuerpo: esquemaPaciente },
    manejador: async (req, res) => { res.status(201).json(await registrarPaciente(pool, config, actor(req), req.validado.cuerpo)); } });
  registro.agregar({ metodo: "patch", ruta: "/api/pacientes/:id", acceso: registrar, esquema: { params: idEsq, cuerpo: esquemaEdicion },
    manejador: async (req, res) => { res.json(await editarPaciente(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/pacientes/:id/encargados", acceso: registrar, esquema: { params: idEsq, cuerpo: encargado },
    manejador: async (req, res) => { res.status(201).json(await agregarEncargado(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/pacientes/emergencia", acceso: registrar,
    esquema: { cuerpo: z.object({ sexo: z.enum(["F", "M"]), edad_aproximada_anios: z.number().int().min(0).max(120), nombres: nombre.nullish(), apellidos: nombre.nullish() }).strict() },
    manejador: async (req, res) => { res.status(201).json(await registrarEmergencia(pool, actor(req), req.validado.cuerpo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/pacientes/:id/unir", acceso: { permiso: "unir_pacientes" },
    esquema: { params: idEsq, cuerpo: z.object({ id_paciente_unido: entero, motivo: z.string().trim().min(5).max(250) }).strict() },
    manejador: async (req, res) => { res.json(await unirPacientes(pool, actor(req), req.validado.params.id, req.validado.cuerpo.id_paciente_unido, req.validado.cuerpo.motivo)); } });

  // Atenciones
  registro.agregar({ metodo: "post", ruta: "/api/atenciones", acceso: { permiso: "abrir_atencion" },
    esquema: { cuerpo: z.object({ id_paciente: entero, id_tipo_atencion: entero }).strict() },
    manejador: async (req, res) => { res.status(201).json(await abrirAtencion(pool, actor(req), req.validado.cuerpo.id_paciente, req.validado.cuerpo.id_tipo_atencion)); } });
  registro.agregar({ metodo: "get", ruta: "/api/atenciones/abiertas", acceso: { permiso: "abrir_atencion" }, manejador: async (_req, res) => { res.json({ datos: await listarAbiertas(pool) }); } });
  registro.agregar({ metodo: "get", ruta: "/api/atenciones/:id", acceso: ver, esquema: { params: idEsq },
    manejador: async (req, res) => { res.json(await obtenerAtencion(pool, req.validado.params.id)); } });
  registro.agregar({ metodo: "get", ruta: "/api/atenciones/:id/ticket", acceso: { permiso: "abrir_atencion" }, esquema: { params: idEsq },
    manejador: async (req, res) => { res.json(await datosTicket(pool, config, req.validado.params.id)); } });
  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/se-retiro", acceso: { permiso: "marcar_se_retiro" }, esquema: { params: idEsq },
    manejador: async (req, res) => { res.json(await marcarSeRetiro(pool, actor(req), req.validado.params.id)); } });
}
