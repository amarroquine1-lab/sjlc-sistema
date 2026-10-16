import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import { tramoActual, type UsuarioActor } from "../cola/servicio.js";

export interface DatosEvaluacion { diagnostico_nutricional: string; codigo_cie10?: string | null; observaciones?: string | null }

const COLUMNAS = `e.id_evaluacion_nutricional, e.diagnostico_nutricional, e.codigo_cie10, e.observaciones,
  to_char(e.fecha_creacion, 'DD/MM/YYYY HH24:MI') AS registrada, (u.nombres || ' ' || u.apellidos) AS registrada_por`;

export async function evaluacionVigente(c: pg.Pool | pg.PoolClient, idAtencion: number) {
  const r = await c.query(`SELECT ${COLUMNAS} FROM evaluaciones_nutricionales e JOIN usuarios u USING (id_usuario) WHERE e.id_atencion = $1 AND e.vigente`, [idAtencion]);
  return r.rows[0] ?? null;
}

// Evaluación nutricional (provisional, P8). Corregirla deja la anterior como no vigente; nada se borra.
export async function guardarEvaluacion(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d: DatosEvaluacion) {
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    if (t.nombre_area !== "nutrición") throw new ErrorApi(403, "OTRA_AREA", "La evaluación se registra en el área de nutrición.");
    const previo = await c.query("SELECT id_evaluacion_nutricional FROM evaluaciones_nutricionales WHERE id_atencion = $1 AND vigente FOR UPDATE", [idAtencion]);
    const anterior = previo.rows[0]?.id_evaluacion_nutricional ?? null;
    if (anterior) await c.query("UPDATE evaluaciones_nutricionales SET vigente = false WHERE id_evaluacion_nutricional = $1", [anterior]);
    await c.query(
      "INSERT INTO evaluaciones_nutricionales (id_atencion, id_usuario, diagnostico_nutricional, codigo_cie10, observaciones, corrige_a) VALUES ($1, $2, $3, $4, $5, $6)",
      [idAtencion, actor.idUsuario, d.diagnostico_nutricional, d.codigo_cie10 ?? null, d.observaciones ?? null, anterior]);
  });
  return evaluacionVigente(pool, idAtencion);
}
