import type pg from "pg";
import { AREAS } from "../cola/servicio.js";

export interface FiltroBitacora {
  usuario?: string; accion?: string; entidad?: string; id_registro?: number; desde?: string; hasta?: string; pagina: number; por_pagina: number;
}

// Bitácora con filtros. Solo administradores. Los valores anterior y nuevo se piden aparte (detalle) porque pueden ser grandes.
export async function listarBitacora(pool: pg.Pool, f: FiltroBitacora) {
  const cond: string[] = []; const v: unknown[] = [];
  const p = (x: unknown) => { v.push(x); return `$${v.length}`; };
  if (f.usuario) { const t = p(`%${f.usuario.replace(/[\\%_]/g, "\\$&")}%`); cond.push(`(unaccent_inmutable(coalesce(u.nombre_usuario, b.nombre_usuario_intentado, '')) ILIKE unaccent_inmutable(${t}))`); }
  if (f.accion) cond.push(`b.accion = ${p(f.accion)}`);
  if (f.entidad) cond.push(`b.entidad = ${p(f.entidad)}`);
  if (f.id_registro) cond.push(`b.id_registro = ${p(f.id_registro)}`);
  if (f.desde) cond.push(`b.fecha_hora >= ${p(f.desde)}::date`);
  if (f.hasta) cond.push(`b.fecha_hora < (${p(f.hasta)}::date + 1)`);
  const donde = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const SQL_DESDE = "FROM bitacora b LEFT JOIN usuarios u ON u.id_usuario = b.id_usuario";
  const total = (await pool.query(`SELECT count(*)::int AS n ${SQL_DESDE} ${donde}`, v)).rows[0].n as number;
  const PH_LIMITE = p(f.por_pagina); const PH_DESPLAZAMIENTO = p((f.pagina - 1) * f.por_pagina);
  const filas = await pool.query(
    `SELECT b.id_bitacora, to_char(b.fecha_hora, 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora, coalesce(u.nombre_usuario, CASE WHEN b.nombre_usuario_intentado IS NULL THEN NULL ELSE left(b.nombre_usuario_intentado, 2) || '… (desconocido)' END) AS usuario,
            b.accion, b.entidad, b.id_registro, host(b.direccion_ip) AS direccion_ip, b.detalle
       ${SQL_DESDE} ${donde} ORDER BY b.id_bitacora DESC LIMIT ${PH_LIMITE} OFFSET ${PH_DESPLAZAMIENTO}`, v);
  return { datos: filas.rows, total, pagina: f.pagina, por_pagina: f.por_pagina };
}

export async function detalleBitacora(pool: pg.Pool, id: number) {
  const r = await pool.query("SELECT id_bitacora, valor_anterior, valor_nuevo, detalle FROM bitacora WHERE id_bitacora = $1", [id]);
  return r.rows[0] ?? null;
}

export async function opcionesBitacora(pool: pg.Pool) {
  const [a, e] = await Promise.all([pool.query("SELECT DISTINCT accion FROM bitacora ORDER BY 1"), pool.query("SELECT DISTINCT entidad FROM bitacora ORDER BY 1")]);
  return { acciones: a.rows.map((x) => x.accion), entidades: e.rows.map((x) => x.entidad) };
}

// Estado de las colas: cuántos esperan, cuánto llevan esperando y quién atiende en cada área.
export async function estadoColas(pool: pg.Pool) {
  const r = await pool.query(
    `SELECT ar.nombre_area AS area,
            count(*) FILTER (WHERE r.fecha_hora_inicio IS NULL)::int AS en_espera,
            count(*) FILTER (WHERE r.fecha_hora_inicio IS NOT NULL)::int AS en_atencion,
            coalesce(max(floor(extract(epoch FROM (now() - r.fecha_hora_entrada)) / 60)) FILTER (WHERE r.fecha_hora_inicio IS NULL), 0)::int AS espera_maxima_minutos,
            coalesce(string_agg(DISTINCT u.nombres || ' ' || u.apellidos, ', ') FILTER (WHERE r.fecha_hora_inicio IS NOT NULL), '') AS atendiendo
       FROM recorridos_atencion r JOIN areas ar USING (id_area) JOIN atenciones a USING (id_atencion) LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
      WHERE r.fecha_hora_salida IS NULL AND a.estado IN ('en_espera', 'enviado', 'en_atencion') GROUP BY ar.nombre_area`);
  const porArea = new Map(r.rows.map((x) => [x.area as string, x]));
  const areas = Object.values(AREAS).map((n) => porArea.get(n) ?? { area: n, en_espera: 0, en_atencion: 0, espera_maxima_minutos: 0, atendiendo: "" });
  const abiertas = (await pool.query("SELECT count(*)::int AS n FROM atenciones WHERE estado IN ('en_espera', 'enviado', 'en_atencion')")).rows[0].n as number;
  const sesiones = (await pool.query("SELECT count(*)::int AS n FROM sesiones WHERE revocada_en IS NULL AND fecha_hora_vence_absoluta > now() AND fecha_hora_ultima_actividad > now() - interval '15 minutes'")).rows[0].n as number;
  return { areas, atenciones_abiertas: abiertas, sesiones_activas: sesiones };
}
