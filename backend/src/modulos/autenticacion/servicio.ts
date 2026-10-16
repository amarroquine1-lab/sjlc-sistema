import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { registrarEvento, registrarEventoEn } from "../../bitacora/servicio.js";
import { ErrorApi } from "../../comun/errores.js";
import { hashearContrasena, normalizar, validarPolitica, verificarContraFalso, verificarContrasena } from "../../seguridad/contrasenas.js";
import { crearSesion, revocarSesion, revocarSesionesDeUsuario } from "../../seguridad/sesiones.js";

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
const MENSAJE_GENERICO = "Usuario o contraseña incorrectos.";

export interface ContextoPeticion { ip: string | null; agente: string | null }

async function fallosRecientesDeIp(pool: pg.Pool, ip: string | null): Promise<number> {
  if (!ip) return 0;
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM bitacora
      WHERE accion = 'inicio_sesion_fallido' AND direccion_ip = $1::inet AND fecha_hora > now() - make_interval(mins => $2)`,
    [ip, MINUTOS_BLOQUEO],
  );
  return r.rows[0].n as number;
}

export async function ingresar(pool: pg.Pool, usuario: string, contrasena: string, ctx: ContextoPeticion, limiteFallosIp: number):
  Promise<{ idUsuario: number; idSesion: string; debeCambiarContrasena: boolean }> {
  // Límite por IP real: se cuenta en la bitácora (sobrevive a reinicios) y no se evalúa la contraseña.
  if ((await fallosRecientesDeIp(pool, ctx.ip)) >= limiteFallosIp) {
    throw new ErrorApi(429, "DEMASIADOS_INTENTOS", "Demasiados intentos fallidos desde su ubicación. Espere unos minutos.", undefined,
      { "Retry-After": String(MINUTOS_BLOQUEO * 60) });
  }
  const fallo = (idUsuario: number | null, detalle: string) =>
    registrarEvento(pool, {
      accion: "inicio_sesion_fallido", entidad: "usuarios", idRegistro: idUsuario, idUsuario,
      nombreUsuarioIntentado: usuario, detalle, direccionIp: ctx.ip,
    });

  const r = await pool.query(
    `SELECT id_usuario, contrasena_hash, activo, debe_cambiar_contrasena,
            bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now() AS bloqueado,
            CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - now())) / 60)::int AS minutos
       FROM usuarios WHERE nombre_usuario = $1`,
    [usuario],
  );
  const u = r.rows[0];
  if (!u) {
    await verificarContraFalso(contrasena);
    await fallo(null, "usuario inexistente");
    throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", MENSAJE_GENERICO);
  }
  if (u.bloqueado) {
    await fallo(u.id_usuario, "cuenta bloqueada");
    throw new ErrorApi(423, "CUENTA_BLOQUEADA",
      `La cuenta está bloqueada por intentos fallidos. Intente de nuevo en ${u.minutos} minuto(s) o pida a un administrador que la desbloquee.`);
  }
  if (!u.activo) {
    await verificarContraFalso(contrasena);
    await fallo(u.id_usuario, "cuenta inactiva");
    throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", MENSAJE_GENERICO);
  }
  if (!(await verificarContrasena(u.contrasena_hash, contrasena))) {
    const bloqueada = await conTransaccion(pool, { idUsuario: u.id_usuario, direccionIp: ctx.ip }, async (c) => {
      const a = await c.query(
        `WITH nuevo AS (
           SELECT CASE WHEN bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= now() THEN 1 ELSE intentos_fallidos + 1 END AS n
             FROM usuarios WHERE id_usuario = $1 FOR UPDATE)
         UPDATE usuarios SET intentos_fallidos = nuevo.n,
                bloqueado_hasta = CASE WHEN nuevo.n >= $2 THEN now() + make_interval(mins => $3) END
           FROM nuevo WHERE id_usuario = $1 RETURNING usuarios.intentos_fallidos AS n, usuarios.bloqueado_hasta IS NOT NULL AS bloqueada`,
        [u.id_usuario, MAX_INTENTOS, MINUTOS_BLOQUEO],
      );
      await registrarEventoEn(c, { accion: "inicio_sesion_fallido", entidad: "usuarios", idRegistro: u.id_usuario, idUsuario: u.id_usuario,
        nombreUsuarioIntentado: usuario, detalle: `intento ${a.rows[0].n}`, direccionIp: ctx.ip });
      if (a.rows[0].bloqueada) {
        await registrarEventoEn(c, { accion: "bloqueo_cuenta", entidad: "usuarios", idRegistro: u.id_usuario, idUsuario: u.id_usuario,
          detalle: `${MAX_INTENTOS} intentos fallidos`, direccionIp: ctx.ip });
      }
      return a.rows[0].bloqueada as boolean;
    });
    if (bloqueada) {
      throw new ErrorApi(423, "CUENTA_BLOQUEADA", `La cuenta se bloqueó por ${MAX_INTENTOS} intentos fallidos. Intente de nuevo en ${MINUTOS_BLOQUEO} minutos.`);
    }
    throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", MENSAJE_GENERICO);
  }
  // Ingreso correcto: el propio usuario es el actor de sus cambios de intentos y último ingreso.
  const idSesion = await conTransaccion(pool, { idUsuario: u.id_usuario, direccionIp: ctx.ip }, async (c) => {
    await c.query("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = now() WHERE id_usuario = $1", [u.id_usuario]);
    const id = await crearSesion(pool, { idUsuario: u.id_usuario, ip: ctx.ip, agente: ctx.agente }, c);
    await registrarEventoEn(c, { accion: "inicio_sesion", entidad: "usuarios", idRegistro: u.id_usuario, idUsuario: u.id_usuario, direccionIp: ctx.ip });
    return id;
  });
  return { idUsuario: u.id_usuario, idSesion, debeCambiarContrasena: u.debe_cambiar_contrasena };
}

export async function salir(pool: pg.Pool, idUsuario: number, idSesion: string, ip: string | null): Promise<void> {
  await revocarSesion(pool, idSesion, "salida");
  await registrarEvento(pool, { accion: "cierre_sesion", entidad: "sesiones", idUsuario, direccionIp: ip });
}

export async function cambiarContrasena(
  pool: pg.Pool, idUsuario: number, idSesion: string, actual: string, nueva: string, ip: string | null,
): Promise<void> {
  const r = await pool.query("SELECT nombre_usuario, nombres, apellidos, contrasena_hash FROM usuarios WHERE id_usuario = $1", [idUsuario]);
  const u = r.rows[0];
  if (!u || !(await verificarContrasena(u.contrasena_hash, actual))) {
    await registrarEvento(pool, { accion: "acceso_denegado", entidad: "usuarios", idRegistro: idUsuario, idUsuario, direccionIp: ip,
      detalle: "contraseña actual incorrecta al cambiar la contraseña" });
    throw new ErrorApi(403, "CONTRASENA_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.");
  }
  if (normalizar(actual) === normalizar(nueva)) throw new ErrorApi(422, "CONTRASENA_NO_VALIDA", "La contraseña nueva debe ser distinta de la actual.");
  const motivo = validarPolitica(nueva, { nombreUsuario: u.nombre_usuario });
  if (motivo) throw new ErrorApi(422, "CONTRASENA_NO_VALIDA", motivo);
  const nuevoHash = await hashearContrasena(nueva);
  await conTransaccion(pool, { idUsuario, direccionIp: ip }, async (c) => {
    await c.query("UPDATE usuarios SET contrasena_hash = $2, debe_cambiar_contrasena = false WHERE id_usuario = $1", [idUsuario, nuevoHash]);
    await revocarSesionesDeUsuario(c, idUsuario, "cambio_contrasena", idSesion);
    await registrarEventoEn(c, { accion: "cambio_contrasena", entidad: "usuarios", idRegistro: idUsuario, idUsuario, direccionIp: ip });
  });
}
