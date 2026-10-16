import { z } from "zod";
import type { Dependencias } from "../../middleware/seguridad.js";
import { borrarCookie, fijarCookie } from "../../middleware/seguridad.js";
import { ipCliente } from "../../comun/ip.js";
import type { RegistroRutas } from "../../seguridad/rutas.js";
import { cambiarContrasena, ingresar, salir } from "./servicio.js";

const esquemaIngreso = z.object({
  usuario: z.string().min(1).max(30).regex(/^[a-z]+$/),
  contrasena: z.string().min(1).max(256),
}).strict();

const esquemaCambio = z.object({
  contrasena_actual: z.string().min(1).max(256),
  contrasena_nueva: z.string().min(1).max(256),
}).strict();

export function rutasAutenticacion(registro: RegistroRutas, deps: Dependencias): void {
  registro.agregar({
    metodo: "post", ruta: "/api/autenticacion/ingresar", acceso: "publica", esquema: { cuerpo: esquemaIngreso },
    manejador: async (req, res) => {
      const { usuario, contrasena } = req.validado.cuerpo;
      const r = await ingresar(deps.pool, usuario, contrasena, { ip: ipCliente(req), agente: req.get("user-agent") ?? null }, deps.config.limiteFallosIp);
      fijarCookie(res, deps.config, r.idUsuario, r.idSesion);
      res.json({ ok: true, debe_cambiar_contrasena: r.debeCambiarContrasena });
    },
  });
  registro.agregar({
    metodo: "post", ruta: "/api/autenticacion/salir", acceso: "sesion", permiteCambioPendiente: true,
    manejador: async (req, res) => {
      await salir(deps.pool, req.usuario!.idUsuario, req.idSesion!, ipCliente(req));
      borrarCookie(res);
      res.json({ ok: true });
    },
  });
  registro.agregar({
    metodo: "post", ruta: "/api/autenticacion/cambiar-contrasena", acceso: "sesion", permiteCambioPendiente: true,
    esquema: { cuerpo: esquemaCambio },
    manejador: async (req, res) => {
      const { contrasena_actual, contrasena_nueva } = req.validado.cuerpo;
      await cambiarContrasena(deps.pool, req.usuario!.idUsuario, req.idSesion!, contrasena_actual, contrasena_nueva, ipCliente(req));
      fijarCookie(res, deps.config, req.usuario!.idUsuario, req.idSesion!);
      res.json({ ok: true });
    },
  });
  registro.agregar({
    metodo: "get", ruta: "/api/yo", acceso: "sesion", permiteCambioPendiente: true,
    manejador: async (req, res) => {
      const u = req.usuario!;
      const r = await deps.pool.query(
        "SELECT to_char(fecha_hora_ultima_actividad + make_interval(mins => $2), 'YYYY-MM-DD\"T\"HH24:MI:SSOF') AS vence FROM sesiones WHERE id_sesion = $1",
        [req.idSesion, deps.config.minutosInactividad],
      );
      res.json({
        id_usuario: u.idUsuario, nombre_usuario: u.nombreUsuario, nombres: u.nombres, apellidos: u.apellidos,
        rol: u.rol, area: u.area, debe_cambiar_contrasena: u.debeCambiarContrasena,
        vence_por_inactividad_en: r.rows[0]?.vence ?? null,
      });
    },
  });
}
