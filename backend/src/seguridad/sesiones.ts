import type pg from "pg";

export type MotivoRevocacion =
  | "salida" | "inactividad" | "cambio_contrasena" | "restablecimiento" | "desactivacion" | "cambio_rol" | "desconocido";

export interface EstadoSesion {
  idSesion: string;
  idUsuario: number;
  revocada: boolean;
  vigenteAbsoluta: boolean;
  activa: boolean;
  debeRenovar: boolean;
  usuarioActivo: boolean;
  nombreUsuario: string;
  nombres: string;
  apellidos: string;
  idRol: number;
  rol: string;
  area: string | null;
  debeCambiarContrasena: boolean;
}

export async function crearSesion(
  pool: pg.Pool, datos: { idUsuario: number; ip: string | null; agente: string | null },
  cliente: pg.Pool | pg.PoolClient = pool,
): Promise<string> {
  const r = await cliente.query(
    "INSERT INTO sesiones (id_usuario, direccion_ip, agente_usuario) VALUES ($1, $2, $3) RETURNING id_sesion",
    [datos.idUsuario, datos.ip, datos.agente ? datos.agente.slice(0, 200) : null],
  );
  return r.rows[0].id_sesion as string;
}

// Todo se mide con el reloj de la base de datos.
export async function leerSesion(pool: pg.Pool, idSesion: string, minutosInactividad: number): Promise<EstadoSesion | null> {
  const r = await pool.query(
    `SELECT s.id_sesion, s.id_usuario, s.revocada_en IS NOT NULL AS revocada,
            s.fecha_hora_vence_absoluta > now() AS vigente_absoluta,
            now() - s.fecha_hora_ultima_actividad < make_interval(mins => $2) AS activa,
            now() - s.fecha_hora_ultima_actividad > interval '30 seconds' AS debe_renovar,
            u.activo, u.nombre_usuario, u.nombres, u.apellidos, u.id_rol, u.debe_cambiar_contrasena,
            r.nombre_rol, a.nombre_area
       FROM sesiones s
       JOIN usuarios u ON u.id_usuario = s.id_usuario
       JOIN roles r ON r.id_rol = u.id_rol
       LEFT JOIN areas a ON a.id_area = r.id_area
      WHERE s.id_sesion = $1`,
    [idSesion, minutosInactividad],
  );
  const f = r.rows[0];
  if (!f) return null;
  return {
    idSesion: f.id_sesion, idUsuario: f.id_usuario, revocada: f.revocada, vigenteAbsoluta: f.vigente_absoluta,
    activa: f.activa, debeRenovar: f.debe_renovar, usuarioActivo: f.activo, nombreUsuario: f.nombre_usuario,
    nombres: f.nombres, apellidos: f.apellidos, idRol: f.id_rol, rol: f.nombre_rol, area: f.nombre_area,
    debeCambiarContrasena: f.debe_cambiar_contrasena,
  };
}

export async function tocarActividad(pool: pg.Pool, idSesion: string): Promise<void> {
  await pool.query("UPDATE sesiones SET fecha_hora_ultima_actividad = now() WHERE id_sesion = $1 AND revocada_en IS NULL", [idSesion]);
}

export async function revocarSesion(pool: pg.Pool | pg.PoolClient, idSesion: string, motivo: MotivoRevocacion): Promise<void> {
  await pool.query(
    "UPDATE sesiones SET revocada_en = now(), motivo_revocacion = $2 WHERE id_sesion = $1 AND revocada_en IS NULL",
    [idSesion, motivo],
  );
}

// Revoca todas las sesiones abiertas de un usuario, menos (opcionalmente) la actual.
export async function revocarSesionesDeUsuario(
  pool: pg.Pool | pg.PoolClient, idUsuario: number, motivo: MotivoRevocacion, excepto?: string,
): Promise<number> {
  const r = await pool.query(
    `UPDATE sesiones SET revocada_en = now(), motivo_revocacion = $2
      WHERE id_usuario = $1 AND revocada_en IS NULL AND ($3::uuid IS NULL OR id_sesion <> $3::uuid)`,
    [idUsuario, motivo, excepto ?? null],
  );
  return r.rowCount ?? 0;
}
