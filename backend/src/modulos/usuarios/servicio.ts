import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { registrarEventoEn } from "../../bitacora/servicio.js";
import { ErrorApi } from "../../comun/errores.js";
import { generarContrasenaTemporal, hashearContrasena } from "../../seguridad/contrasenas.js";
import { revocarSesionesDeUsuario } from "../../seguridad/sesiones.js";
import { candidatosNombreUsuario, elegirNombreUsuario } from "./nombres.js";

const COLUMNAS = `u.id_usuario, u.nombre_usuario, u.nombres, u.apellidos, u.id_rol, r.nombre_rol AS rol, a.nombre_area AS area,
  u.activo, u.debe_cambiar_contrasena, u.intentos_fallidos, u.bloqueado_hasta, u.ultimo_ingreso, u.fecha_creacion, u.eliminado_el,
  (u.ultimo_ingreso IS NOT NULL OR public.usuario_tiene_registros(u.id_usuario)) AS tiene_registros,
  (u.activo AND r.nombre_rol = 'administrador' AND NOT EXISTS (
     SELECT 1 FROM usuarios o JOIN roles ro ON ro.id_rol = o.id_rol WHERE o.activo AND ro.nombre_rol = 'administrador' AND o.id_usuario <> u.id_usuario)) AS es_ultimo_admin`;
// La cuenta "sistema" (tareas automáticas) no aparece ni se gestiona desde la API.
const DESDE = "FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol LEFT JOIN areas a ON a.id_area = r.id_area";
const SIN_SISTEMA = "u.nombre_usuario <> 'sistema'";

export interface Actor { idUsuario: number; ip: string | null }

// Por qué no se puede eliminar a este usuario (null si se puede). La base de datos vuelve a validar lo mismo.
// Eliminar sirve para cualquier usuario: sin actividad se borra por completo; con actividad se quita del sistema y sus registros se conservan.
type FilaEliminable = { id_usuario: number; tiene_registros: boolean; es_ultimo_admin: boolean; eliminado_el?: string | Date | null };
export function motivoNoEliminar(u: FilaEliminable, idActor: number): string | null {
  if (u.eliminado_el) return "Este usuario ya fue eliminado.";
  if (u.id_usuario === idActor) return "No puede eliminar su propia cuenta.";
  if (u.es_ultimo_admin) return "No se puede eliminar al último administrador activo.";
  return null;
}
export const modoEliminacion = (u: Pick<FilaEliminable, "tiene_registros">): "borrar" | "quitar" => (u.tiene_registros ? "quitar" : "borrar");
export function conPermisoEliminar<T extends FilaEliminable>(u: T, idActor: number) {
  const motivo = motivoNoEliminar(u, idActor);
  return { ...u, puede_eliminar: motivo === null, motivo_no_eliminar: motivo, modo_eliminacion: modoEliminacion(u) };
}

export async function listarRoles(pool: pg.Pool) {
  const r = await pool.query("SELECT r.id_rol, r.nombre_rol, a.nombre_area AS area FROM roles r LEFT JOIN areas a ON a.id_area = r.id_area ORDER BY r.id_rol");
  return r.rows;
}

export async function listarUsuarios(pool: pg.Pool, f: { q?: string; rol?: string; activo?: boolean; incluir_eliminados?: boolean; pagina: number; por_pagina: number }) {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (f.q) {
    valores.push(f.q.replace(/[\\%_]/g, (m) => `\\${m}`));
    condiciones.push(`public.unaccent_inmutable(lower(u.nombres || ' ' || u.apellidos || ' ' || u.nombre_usuario)) LIKE '%' || public.unaccent_inmutable(lower($${valores.length})) || '%'`);
  }
  if (f.rol) { valores.push(f.rol); condiciones.push(`r.nombre_rol = $${valores.length}`); }
  if (f.activo !== undefined) { valores.push(f.activo); condiciones.push(`u.activo = $${valores.length}`); }
  condiciones.push(SIN_SISTEMA);
  if (!f.incluir_eliminados) condiciones.push("u.eliminado_el IS NULL");
  const donde = `WHERE ${condiciones.join(" AND ")}`;
  const total = await pool.query(`SELECT count(*)::int AS n ${DESDE} ${donde}`, valores);
  valores.push(f.por_pagina, (f.pagina - 1) * f.por_pagina);
  const filas = await pool.query(
    `SELECT ${COLUMNAS} ${DESDE} ${donde} ORDER BY u.apellidos, u.nombres, u.id_usuario LIMIT $${valores.length - 1} OFFSET $${valores.length}`, valores);
  return { datos: filas.rows, pagina: f.pagina, por_pagina: f.por_pagina, total: total.rows[0].n as number };
}

export async function obtenerUsuario(pool: pg.Pool | pg.PoolClient, id: number) {
  const r = await pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE u.id_usuario = $1 AND u.nombre_usuario <> 'sistema'`, [id]);
  if (!r.rows[0]) throw new ErrorApi(404, "USUARIO_NO_ENCONTRADO", "No se encontró el usuario.");
  return r.rows[0];
}

function exigirNoEliminado(u: { eliminado_el?: string | Date | null }): void {
  if (u.eliminado_el) throw new ErrorApi(409, "USUARIO_ELIMINADO", "Este usuario fue eliminado y no se puede modificar ni reactivar.");
}

async function exigirRol(pool: pg.Pool | pg.PoolClient, idRol: number): Promise<void> {
  const r = await pool.query("SELECT 1 FROM roles WHERE id_rol = $1", [idRol]);
  if (!r.rowCount) throw new ErrorApi(422, "ROL_NO_VALIDO", "El rol indicado no existe.");
}

async function administradoresActivos(pool: pg.Pool | pg.PoolClient): Promise<number> {
  const r = await pool.query(
    "SELECT count(*)::int AS n FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre_rol = 'administrador' AND u.activo");
  return r.rows[0].n as number;
}

export async function crearUsuario(
  pool: pg.Pool, actor: Actor, datos: { nombres: string; apellidos: string; id_rol: number; nombre_usuario?: string },
): Promise<{ usuario: any; contrasena_temporal: string }> {
  await exigirRol(pool, datos.id_rol);
  let nombreUsuario = datos.nombre_usuario;
  if (!nombreUsuario) {
    const candidatos = candidatosNombreUsuario(datos.nombres, datos.apellidos);
    if (candidatos.length === 0) throw new ErrorApi(422, "NOMBRE_USUARIO_NO_GENERADO", "No se pudo generar el nombre de usuario. Escríbalo manualmente.");
    const r = await pool.query("SELECT nombre_usuario FROM usuarios WHERE nombre_usuario = ANY($1::text[])", [candidatos]);
    nombreUsuario = elegirNombreUsuario(candidatos, new Set(r.rows.map((x) => x.nombre_usuario as string))) ?? undefined;
    if (!nombreUsuario) throw new ErrorApi(422, "NOMBRE_USUARIO_AGOTADO", "Ya existen usuarios parecidos. Escriba un nombre de usuario manualmente.");
  }
  const temporal = generarContrasenaTemporal();
  const hash = await hashearContrasena(temporal);
  const id = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO usuarios (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash, debe_cambiar_contrasena)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id_usuario`,
        [nombreUsuario, datos.nombres.trim(), datos.apellidos.trim(), datos.id_rol, hash]);
      return r.rows[0].id_usuario as number;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ErrorApi(409, "NOMBRE_USUARIO_EN_USO", "Ya existe un usuario con ese nombre de usuario.");
      throw error;
    }
  });
  return { usuario: await obtenerUsuario(pool, id), contrasena_temporal: temporal };
}

export async function editarUsuario(
  pool: pg.Pool, actor: Actor, id: number, cambios: { nombres?: string; apellidos?: string; id_rol?: number },
) {
  const actual = await obtenerUsuario(pool, id);
  exigirNoEliminado(actual);
  if (id === actor.idUsuario) {
    throw new ErrorApi(409, "NO_SOBRE_SI_MISMO", "No puede cambiar sus propios datos de usuario. Pida a otro administrador que lo haga.");
  }
  if (cambios.id_rol !== undefined) await exigirRol(pool, cambios.id_rol);
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    if (cambios.id_rol !== undefined && cambios.id_rol !== actual.id_rol && actual.rol === "administrador" && actual.activo
        && (await administradoresActivos(c)) <= 1) {
      throw new ErrorApi(409, "ULTIMO_ADMINISTRADOR", "No se puede cambiar el rol del último administrador activo.");
    }
    await c.query(
      `UPDATE usuarios SET nombres = COALESCE($2, nombres), apellidos = COALESCE($3, apellidos), id_rol = COALESCE($4, id_rol) WHERE id_usuario = $1`,
      [id, cambios.nombres?.trim() ?? null, cambios.apellidos?.trim() ?? null, cambios.id_rol ?? null]);
    if (cambios.id_rol !== undefined && cambios.id_rol !== actual.id_rol) await revocarSesionesDeUsuario(c, id, "cambio_rol");
  });
  return obtenerUsuario(pool, id);
}

export async function cambiarEstado(pool: pg.Pool, actor: Actor, id: number, activo: boolean) {
  const actual = await obtenerUsuario(pool, id);
  exigirNoEliminado(actual);
  if (!activo && id === actor.idUsuario) throw new ErrorApi(409, "NO_SOBRE_SI_MISMO", "No puede desactivar su propia cuenta.");
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    if (!activo && actual.rol === "administrador" && actual.activo && (await administradoresActivos(c)) <= 1) {
      throw new ErrorApi(409, "ULTIMO_ADMINISTRADOR", "No se puede desactivar al último administrador activo.");
    }
    await c.query("UPDATE usuarios SET activo = $2 WHERE id_usuario = $1", [id, activo]);
    if (!activo) await revocarSesionesDeUsuario(c, id, "desactivacion");
  });
  return obtenerUsuario(pool, id);
}

export async function restablecerContrasena(pool: pg.Pool, actor: Actor, id: number) {
  exigirNoEliminado(await obtenerUsuario(pool, id));
  const temporal = generarContrasenaTemporal();
  const hash = await hashearContrasena(temporal);
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    await c.query(
      "UPDATE usuarios SET contrasena_hash = $2, debe_cambiar_contrasena = true, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1", [id, hash]);
    await revocarSesionesDeUsuario(c, id, "restablecimiento");
    await registrarEventoEn(c, { accion: "restablecer_contrasena", entidad: "usuarios", idRegistro: id, idUsuario: actor.idUsuario, direccionIp: actor.ip });
  });
  return { usuario: await obtenerUsuario(pool, id), contrasena_temporal: temporal };
}

export async function desbloquear(pool: pg.Pool, actor: Actor, id: number) {
  exigirNoEliminado(await obtenerUsuario(pool, id));
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    await c.query("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1", [id]);
    await registrarEventoEn(c, { accion: "desbloqueo_cuenta", entidad: "usuarios", idRegistro: id, idUsuario: actor.idUsuario, direccionIp: actor.ip });
  });
  return obtenerUsuario(pool, id);
}

// Elimina una cuenta. Sin actividad: se borra por completo. Con actividad: se marca como eliminada (no ingresa, no se reactiva,
// desaparece de la lista) y la fila se conserva para que su nombre siga en los registros. La confirmación es el nombre de usuario exacto.
export async function eliminarUsuario(pool: pg.Pool, actor: Actor, id: number, confirmacion: string) {
  const u = await obtenerUsuario(pool, id);
  if (confirmacion.trim() !== u.nombre_usuario) {
    throw new ErrorApi(422, "CONFIRMACION_INCORRECTA", "Para eliminar escriba exactamente el nombre de usuario.");
  }
  const motivo = motivoNoEliminar(u, actor.idUsuario);
  if (motivo) throw new ErrorApi(409, u.eliminado_el ? "USUARIO_ELIMINADO" : id === actor.idUsuario ? "NO_SOBRE_SI_MISMO" : "ULTIMO_ADMINISTRADOR", motivo);
  try {
    const modo = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
      // La fila se bloquea y la actividad se vuelve a medir dentro de la transacción: nadie le agrega un registro a la vez.
      await c.query("SELECT 1 FROM usuarios WHERE id_usuario = $1 FOR UPDATE", [id]);
      const tiene = (await c.query("SELECT (ultimo_ingreso IS NOT NULL OR public.usuario_tiene_registros(id_usuario)) AS t FROM usuarios WHERE id_usuario = $1", [id])).rows[0].t as boolean;
      if (!tiene) {
        await c.query("DELETE FROM usuarios WHERE id_usuario = $1", [id]);
        return "borrar" as const;
      }
      await c.query("UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = $1", [id]);
      await revocarSesionesDeUsuario(c, id, "desactivacion");
      return "quitar" as const;
    });
    return { eliminado: true, modo, id_usuario: id, nombre_usuario: u.nombre_usuario };
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "23001" || codigo === "23503") throw new ErrorApi(409, "NO_SE_PUEDE_ELIMINAR", (e as Error).message);
    throw e;
  }
}
