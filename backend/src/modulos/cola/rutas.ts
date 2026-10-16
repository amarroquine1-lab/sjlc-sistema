import { z } from "zod";
import { ErrorApi } from "../../comun/errores.js";
import { ipCliente } from "../../comun/ip.js";
import type { Dependencias } from "../../middleware/seguridad.js";
import type { Accion } from "../../seguridad/permisos.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { historialSignos, registrarSignos } from "../signos/servicio.js";
import { CLAVES_AREA, cerrarDia, enviar, llamarSiguiente, panelAtencion, tramoActual, verCola, type UsuarioActor } from "./servicio.js";

const idEsq = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
// Cada signo lleva su propio mensaje: "La saturación debe estar entre 50 y 100".
const rango = (etiqueta: string, min: number, max: number, unidad = "", entero = false) => {
  const msg = `${etiqueta} debe estar entre ${min} y ${max}${unidad}`;
  const base = z.number({ error: `${etiqueta} debe ser un número` });
  return (entero ? base.int({ error: `${etiqueta} debe ser un número entero` }) : base).min(min, { error: msg }).max(max, { error: msg }).nullish();
};
// Los rangos reflejan los CHECK de la base de datos (pendientes de confirmar con el doctor: P7). El peso llega en libras.
const esquemaSignos = z.object({
  peso_lb: rango("El peso", 0.7, 660, " libras"), talla_cm: rango("La talla", 30, 250, " cm"), temperatura_c: rango("La temperatura", 30, 45, " °C"),
  presion_sistolica: rango("La presión alta", 50, 260, "", true), presion_diastolica: rango("La presión baja", 20, 160, "", true),
  frecuencia_cardiaca: rango("El pulso", 20, 250, " por minuto", true), saturacion_oxigeno: rango("La saturación", 50, 100, "", true),
  hay_signos_peligro: z.boolean().optional(), detalle_signos_peligro: z.string().trim().min(1).max(300, { error: "El detalle de las señales no puede pasar de 300 letras" }).nullish(),
}).strict().refine((v) => !v.detalle_signos_peligro || v.hay_signos_peligro === true, { error: "El detalle solo se escribe si marca que hay señales de peligro", path: ["detalle_signos_peligro"] });

export function rutasCola(registro: RegistroRutas, deps: Dependencias): void {
  const { pool } = deps;
  const actor = (req: import("express").Request): UsuarioActor => ({ idUsuario: req.usuario!.idUsuario, ip: ipCliente(req), rol: req.usuario!.rol, area: req.usuario!.area });

  for (const clave of CLAVES_AREA) {
    const permiso = `atender_${clave}` as Accion;
    registro.agregar({ metodo: "get", ruta: `/api/cola/${clave}`, acceso: { permiso },
      manejador: async (req, res) => { res.json(await verCola(pool, clave, req.usuario!.idUsuario)); } });
    registro.agregar({ metodo: "post", ruta: `/api/cola/${clave}/atender/:id`, acceso: { permiso }, esquema: { params: idEsq },
      manejador: async (req, res) => { res.json(await llamarSiguiente(pool, actor(req), clave, req.validado.params.id)); } });
    registro.agregar({ metodo: "post", ruta: `/api/cola/${clave}/llamar-siguiente`, acceso: { permiso },
      manejador: async (req, res) => { res.json(await llamarSiguiente(pool, actor(req), clave)); } });
  }
  registro.agregar({ metodo: "get", ruta: "/api/atenciones/:id/panel", acceso: { permiso: "atender_cola" }, esquema: { params: idEsq },
    manejador: async (req, res) => { res.json(await panelAtencion(pool, actor(req), req.validado.params.id)); } });
  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/enviar", acceso: { permiso: "atender_cola" },
    esquema: { params: idEsq, cuerpo: z.object({ destino: z.enum(["signos", "doctor", "nutricion", "vacunacion", "farmacia", "finalizar"]),
      motivo: z.string().trim().max(200, { error: "El motivo no puede pasar de 200 letras" }).nullish() }).strict() },
    manejador: async (req, res) => { res.json(await enviar(pool, actor(req), req.validado.params.id, req.validado.cuerpo.destino, req.validado.cuerpo.motivo)); } });
  registro.agregar({ metodo: "post", ruta: "/api/atenciones/:id/signos", acceso: { permiso: "registrar_signos" }, esquema: { params: idEsq, cuerpo: esquemaSignos },
    manejador: async (req, res) => { res.status(201).json(await registrarSignos(pool, actor(req), req.validado.params.id, req.validado.cuerpo)); } });
  registro.agregar({ metodo: "get", ruta: "/api/atenciones/:id/signos", acceso: { permiso: "atender_cola" }, esquema: { params: idEsq },
    manejador: async (req, res) => {
      await tramoActual(pool, actor(req), req.validado.params.id); // solo quien atiende la atención (hasta el historial de la Fase 11)
      res.json({ datos: await historialSignos(pool, req.validado.params.id) });
    } });
  registro.agregar({ metodo: "post", ruta: "/api/administracion/cierre-del-dia", acceso: { permiso: "administracion" },
    manejador: async (req, res) => {
      const r = await cerrarDia(pool, req.usuario!.idUsuario, ipCliente(req));
      if (r.en_curso) throw new ErrorApi(409, "CIERRE_EN_CURSO", "El cierre del día ya se está ejecutando. Intente de nuevo en un momento.");
      res.json(r);
    } });
}
