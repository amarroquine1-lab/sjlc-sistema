import type pg from "pg";
import { registrarEvento } from "../../bitacora/servicio.js";
import { kgALibra } from "../../servicios/calculos.js";
import { type Actor, obtenerPaciente } from "../pacientes/servicio.js";

const agrupar = <T extends { id_atencion: number }>(filas: T[]) => {
  const m = new Map<number, T[]>();
  for (const f of filas) m.set(f.id_atencion, [...(m.get(f.id_atencion) ?? []), f]);
  return m;
};
// El peso se guarda en kilogramos y se muestra en libras.
const pesoEnLibras = (s: Record<string, unknown> | undefined) => {
  if (!s) return null;
  const { peso_kg, ...resto } = s as { peso_kg: number | null } & Record<string, unknown>;
  return { ...resto, peso_lb: peso_kg === null ? null : kgALibra(peso_kg) };
};
const FH = (c: string) => `to_char(${c}, 'DD/MM/YYYY HH24:MI')`;

// Línea de tiempo del paciente: sus atenciones (la más reciente primero) con el recorrido por áreas y lo registrado en cada una.
// Cada consulta queda en bitácora (sección 10.7 de la especificación).
export async function historialPaciente(pool: pg.Pool, actor: Actor, idPaciente: number, pagina: number, porPagina: number) {
  const paciente = await obtenerPaciente(pool, idPaciente);
  const total = (await pool.query("SELECT count(*)::int AS n FROM atenciones WHERE id_paciente = $1", [idPaciente])).rows[0].n as number;
  const base = await pool.query(
    `SELECT a.id_atencion, a.numero_atencion, a.estado, to_char(a.fecha_hora_llegada, 'DD/MM/YYYY HH24:MI') AS llegada, to_char(a.fecha_hora_cierre, 'DD/MM/YYYY HH24:MI') AS cierre,
            ta.nombre_tipo_atencion AS tipo, ta.es_emergencia, (u.nombres || ' ' || u.apellidos) AS abierta_por
       FROM atenciones a JOIN tipos_atencion ta USING (id_tipo_atencion) JOIN usuarios u ON u.id_usuario = a.id_usuario
      WHERE a.id_paciente = $1 ORDER BY a.fecha_hora_llegada DESC, a.id_atencion DESC LIMIT $2 OFFSET $3`, [idPaciente, porPagina, (pagina - 1) * porPagina]);
  const ids = base.rows.map((x) => x.id_atencion as number);

  const consultar = async (sql: string) => agrupar((await pool.query(sql, [ids])).rows);
  const [recorridos, signos, consultas, recetas, evaluaciones, vacunas, controles] = ids.length === 0 ? [] : await Promise.all([
    consultar(`SELECT r.id_atencion, ar.nombre_area AS area, ${FH("r.fecha_hora_entrada")} AS entrada, ${FH("r.fecha_hora_inicio")} AS inicio, ${FH("r.fecha_hora_salida")} AS salida,
                      (u.nombres || ' ' || u.apellidos) AS atendio, r.motivo_envio,
                      CASE WHEN r.fecha_hora_inicio IS NOT NULL THEN floor(extract(epoch FROM (r.fecha_hora_inicio - r.fecha_hora_entrada)) / 60)::int END AS espera_minutos
                 FROM recorridos_atencion r JOIN areas ar USING (id_area) LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
                WHERE r.id_atencion = ANY($1::int[]) ORDER BY r.id_atencion, r.id_recorrido_atencion`),
    consultar(`SELECT s.id_atencion, s.peso_kg::float8 AS peso_kg, s.talla_cm::float8 AS talla_cm, s.temperatura_c::float8 AS temperatura_c, s.presion_sistolica, s.presion_diastolica,
                      s.frecuencia_cardiaca, s.saturacion_oxigeno, s.hay_signos_peligro, s.detalle_signos_peligro, (u.nombres || ' ' || u.apellidos) AS registrado_por
                 FROM signos_vitales s JOIN usuarios u USING (id_usuario) WHERE s.id_atencion = ANY($1::int[]) AND s.vigente`),
    consultar(`SELECT c.id_atencion, c.tipo_consulta, c.motivo_consulta, c.historia_enfermedad, c.conducta_tratamiento, c.problemas_identificados, c.referido_a,
                      (u.nombres || ' ' || u.apellidos) AS atendio,
                      coalesce((SELECT json_agg(json_build_object('descripcion', d.descripcion_diagnostico, 'cie10', d.codigo_cie10) ORDER BY d.id_diagnostico_consulta)
                                  FROM diagnosticos_consulta d WHERE d.id_consulta = c.id_consulta), '[]'::json) AS diagnosticos
                 FROM consultas c JOIN usuarios u USING (id_usuario) WHERE c.id_atencion = ANY($1::int[]) AND c.vigente`),
    consultar(`SELECT r.id_atencion, ar.nombre_area AS receta_de, d.medicamento_texto AS medicamento, d.presentacion_texto AS presentacion, d.cantidad_recetada, d.indicaciones,
                      ed.cantidad_entregada, ed.cantidad_no_entregada, ed.observacion
                 FROM recetas r JOIN areas ar USING (id_area) JOIN recetas_detalle d USING (id_receta)
                 LEFT JOIN entregas_farmacia_detalle ed ON ed.id_receta_detalle = d.id_receta_detalle
                WHERE r.id_atencion = ANY($1::int[]) AND r.vigente ORDER BY r.id_receta, d.id_receta_detalle`),
    consultar(`SELECT e.id_atencion, e.diagnostico_nutricional, e.codigo_cie10, e.observaciones FROM evaluaciones_nutricionales e WHERE e.id_atencion = ANY($1::int[]) AND e.vigente`),
    consultar(`SELECT v.id_atencion, v.nombre_vacuna_texto AS nombre_vacuna, v.numero_dosis, v.lote, to_char(v.fecha_aplicacion, 'DD/MM/YYYY') AS fecha_aplicacion
                 FROM vacunas_aplicadas v WHERE v.id_atencion = ANY($1::int[]) AND v.vigente ORDER BY v.id_vacuna_aplicada`),
    consultar(`SELECT pc.id_atencion, ar.nombre_area AS area, pc.descripcion, to_char(pc.fecha_sugerida, 'DD/MM/YYYY') AS fecha_sugerida, pc.estado
                 FROM proximos_controles pc JOIN areas ar USING (id_area) WHERE pc.id_atencion = ANY($1::int[]) ORDER BY pc.id_proximo_control`),
  ]);

  const sinId = <T extends { id_atencion: number }>(l: T[] | undefined) => (l ?? []).map(({ id_atencion: _i, ...r }) => r);
  const atenciones = base.rows.map((a) => ({
    ...a,
    recorrido: sinId(recorridos?.get(a.id_atencion)),
    signos: pesoEnLibras(sinId(signos?.get(a.id_atencion))[0]),
    consulta: sinId(consultas?.get(a.id_atencion))[0] ?? null,
    receta: sinId(recetas?.get(a.id_atencion)),
    evaluacion_nutricional: sinId(evaluaciones?.get(a.id_atencion))[0] ?? null,
    vacunas: sinId(vacunas?.get(a.id_atencion)),
    proximos_controles: sinId(controles?.get(a.id_atencion)),
  }));

  await registrarEvento(pool, { accion: "ver_historial", entidad: "pacientes", idRegistro: idPaciente, idUsuario: actor.idUsuario, direccionIp: actor.ip, detalle: `historial completo, página ${pagina}` });
  return { paciente, atenciones, total, pagina, por_pagina: porPagina };
}
