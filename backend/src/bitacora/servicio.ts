import type pg from "pg";
import { conTransaccion } from "../bd/conexion.js";

// Acciones que el backend puede escribir directo (la base rechaza cualquier otra).
export type AccionBitacora =
  | "inicio_sesion"
  | "inicio_sesion_fallido"
  | "cierre_sesion"
  | "sesion_expirada"
  | "cambio_contrasena"
  | "restablecer_contrasena"
  | "bloqueo_cuenta"
  | "desbloqueo_cuenta"
  | "acceso_denegado"
  | "ver_historial"
  | "unir"
  | "cierre_dia"
  | "buscar_paciente"
  | "ver_paciente"
  | "atender_directo";

export interface EventoBitacora {
  accion: AccionBitacora;
  entidad: string;
  idRegistro?: number | null;
  detalle?: string | null;
  /** Usuario que actúa (debe coincidir con el de la sesión de la base). */
  idUsuario: number | null;
  nombreUsuarioIntentado?: string | null;
  direccionIp: string | null;
}

const SQL = `INSERT INTO bitacora (id_usuario, nombre_usuario_intentado, accion, entidad, id_registro, direccion_ip, detalle)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`;

// Dentro de una transacción ya abierta con conTransaccion (el usuario ya está fijado).
export async function registrarEventoEn(cliente: pg.PoolClient, e: EventoBitacora): Promise<void> {
  await cliente.query(SQL, [
    e.idUsuario, e.nombreUsuarioIntentado ?? null, e.accion, e.entidad, e.idRegistro ?? null, e.direccionIp, e.detalle ?? null,
  ]);
}

export async function registrarEvento(pool: pg.Pool, e: EventoBitacora): Promise<void> {
  await conTransaccion(pool, { idUsuario: e.idUsuario, direccionIp: e.direccionIp }, (c) => registrarEventoEn(c, e));
}
