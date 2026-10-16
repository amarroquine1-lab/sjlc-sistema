import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import { tramoActual, type UsuarioActor } from "../cola/servicio.js";

export interface DatosVacuna { nombre_vacuna: string; numero_dosis: number; lote?: string | null; fecha_aplicacion: string }

const COLUMNAS = `v.id_vacuna_aplicada, v.id_atencion, v.id_vacuna, v.nombre_vacuna_texto AS nombre_vacuna, v.numero_dosis, v.lote, to_char(v.fecha_aplicacion, 'DD/MM/YYYY') AS fecha_aplicacion,
  to_char(v.fecha_aplicacion, 'YYYY-MM-DD') AS fecha_iso, (u.nombres || ' ' || u.apellidos) AS aplicada_por`;
const DESDE = "FROM vacunas_aplicadas v JOIN usuarios u ON u.id_usuario = v.id_usuario";

export async function listarVacunas(pool: pg.Pool) {
  return (await pool.query("SELECT id_vacuna, nombre_vacuna, dosis_totales FROM vacunas WHERE activo ORDER BY nombre_vacuna")).rows;
}

export async function crearVacuna(pool: pg.Pool, actor: UsuarioActor, d: { nombre_vacuna: string; dosis_totales?: number | null }) {
  return conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const r = await c.query("INSERT INTO vacunas (nombre_vacuna, dosis_totales) VALUES ($1, $2) RETURNING id_vacuna", [d.nombre_vacuna.trim().replace(/\s+/g, " "), d.dosis_totales ?? null]);
    return { id_vacuna: r.rows[0].id_vacuna as number };
  });
}

export async function cambiarEstadoVacuna(pool: pg.Pool, actor: UsuarioActor, id: number, activo: boolean) {
  return conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const r = await c.query("UPDATE vacunas SET activo = $2 WHERE id_vacuna = $1 RETURNING id_vacuna, activo", [id, activo]);
    if (!r.rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "La vacuna no existe.");
    return r.rows[0];
  });
}

// Lo de vacunación para el panel: lo aplicado en esta atención y el esquema del paciente (todas sus dosis vigentes).
export async function datosVacunacion(c: pg.Pool | pg.PoolClient, idAtencion: number) {
  const aplicadas = await c.query(`SELECT ${COLUMNAS} ${DESDE} WHERE v.id_atencion = $1 AND v.vigente ORDER BY v.id_vacuna_aplicada`, [idAtencion]);
  const esquema = await c.query(
    `SELECT ${COLUMNAS}, a.numero_atencion ${DESDE} JOIN atenciones a ON a.id_atencion = v.id_atencion
      WHERE v.vigente AND a.id_paciente = (SELECT id_paciente FROM atenciones WHERE id_atencion = $1) AND v.id_atencion <> $1
      ORDER BY v.fecha_aplicacion DESC, v.id_vacuna_aplicada DESC LIMIT 60`, [idAtencion]);
  const controles = await c.query(
    `SELECT pc.id_proximo_control, ar.nombre_area AS area, pc.descripcion, to_char(pc.fecha_sugerida, 'DD/MM/YYYY') AS fecha_sugerida, pc.estado
       FROM proximos_controles pc JOIN areas ar USING (id_area) WHERE pc.id_atencion = $1 ORDER BY pc.id_proximo_control`, [idAtencion]);
  return { aplicadas: aplicadas.rows, esquema_previo: esquema.rows, proximos_controles: controles.rows };
}

const limpiar = (t: string) => t.trim().replace(/\s+/g, " ");

// El nombre es texto libre; si coincide con una vacuna activa del catálogo se vincula y se respeta su número de dosis.
async function validar(c: pg.PoolClient, idAtencion: number, d: DatosVacuna, corrige: number | null): Promise<number | null> {
  const v = await c.query(
    "SELECT id_vacuna, dosis_totales FROM vacunas WHERE activo AND public.unaccent_inmutable(lower(nombre_vacuna)) = public.unaccent_inmutable(lower($1))", [d.nombre_vacuna]);
  if (v.rows[0]?.dosis_totales && d.numero_dosis > v.rows[0].dosis_totales) {
    throw new ErrorApi(422, "DOSIS_FUERA_DE_ESQUEMA", `Esta vacuna tiene ${v.rows[0].dosis_totales} dosis en el esquema.`);
  }
  if (d.fecha_aplicacion > (await c.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS h")).rows[0].h) throw new ErrorApi(422, "FECHA_FUTURA", "La fecha de aplicación no puede ser futura.");
  const nac = await c.query("SELECT to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS n FROM atenciones a JOIN pacientes p USING (id_paciente) WHERE a.id_atencion = $1", [idAtencion]);
  if (nac.rows[0]?.n && d.fecha_aplicacion < nac.rows[0].n) throw new ErrorApi(422, "FECHA_ANTES_DE_NACER", "La fecha de aplicación es anterior al nacimiento del paciente.");
  // La misma dosis no se registra dos veces para el mismo paciente (salvo al corregir ese mismo registro).
  const ya = await c.query(
    `SELECT 1 FROM vacunas_aplicadas v JOIN atenciones a USING (id_atencion)
      WHERE v.vigente AND public.unaccent_inmutable(lower(v.nombre_vacuna_texto)) = public.unaccent_inmutable(lower($2)) AND v.numero_dosis = $3 AND v.id_vacuna_aplicada IS DISTINCT FROM $4
        AND a.id_paciente = (SELECT id_paciente FROM atenciones WHERE id_atencion = $1) LIMIT 1`, [idAtencion, d.nombre_vacuna, d.numero_dosis, corrige]);
  if (ya.rowCount) throw new ErrorApi(409, "DOSIS_YA_REGISTRADA", "Esa dosis de esa vacuna ya está registrada para el paciente.");
  return v.rows[0]?.id_vacuna ?? null;
}

// Nombres ya escritos antes (y los del catálogo) que empiezan con lo que el usuario va tecleando.
export async function sugerirVacuna(pool: pg.Pool, q: string) {
  const patron = `${q.replace(/[\\%_]/g, "\\$&")}%`;
  const r = await pool.query(
    `SELECT texto FROM (
       SELECT nombre_vacuna_texto AS texto, count(*)::int AS veces FROM vacunas_aplicadas WHERE vigente AND public.unaccent_inmutable(lower(nombre_vacuna_texto)) LIKE public.unaccent_inmutable(lower($1)) GROUP BY nombre_vacuna_texto
       UNION ALL
       SELECT nombre_vacuna, 0 FROM vacunas WHERE activo AND public.unaccent_inmutable(lower(nombre_vacuna)) LIKE public.unaccent_inmutable(lower($1))
     ) s GROUP BY texto ORDER BY sum(veces) DESC, texto LIMIT 10`, [patron]);
  return r.rows.map((x) => x.texto as string);
}

export async function aplicarVacuna(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d0: DatosVacuna, corrige: number | null = null) {
  const d = { ...d0, nombre_vacuna: limpiar(d0.nombre_vacuna) };
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    if (t.nombre_area !== "vacunación") throw new ErrorApi(403, "OTRA_AREA", "Las vacunas se registran en el área de vacunación.");
    if (corrige !== null) {
      const p = await c.query("SELECT 1 FROM vacunas_aplicadas WHERE id_vacuna_aplicada = $1 AND id_atencion = $2 AND vigente FOR UPDATE", [corrige, idAtencion]);
      if (!p.rowCount) throw new ErrorApi(404, "NO_ENCONTRADO", "Ese registro de vacuna no existe en esta atención o ya fue corregido.");
      await c.query("UPDATE vacunas_aplicadas SET vigente = false WHERE id_vacuna_aplicada = $1", [corrige]);
    }
    const idVacuna = await validar(c, idAtencion, d, corrige);
    await c.query(
      "INSERT INTO vacunas_aplicadas (id_atencion, id_vacuna, nombre_vacuna_texto, numero_dosis, lote, fecha_aplicacion, id_usuario, corrige_a) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [idAtencion, idVacuna, d.nombre_vacuna, d.numero_dosis, d.lote ?? null, d.fecha_aplicacion, actor.idUsuario, corrige]);
  });
  return datosVacunacion(pool, idAtencion);
}
