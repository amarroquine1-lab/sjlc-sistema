import type pg from "pg";
import { registrarEvento } from "../../bitacora/servicio.js";
import { ErrorApi } from "../../comun/errores.js";
import { calcularEdad } from "../../servicios/calculos.js";
import type { Actor } from "../pacientes/servicio.js";

export const TIPOS_REPORTE = ["atenciones", "pacientes-por-area", "tiempos-espera", "medicamentos-entregados", "vacunas-aplicadas", "consultas-diarias"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];
export interface FiltroReporte { desde: string; hasta: string; agrupar: "day" | "month" }

export interface Reporte {
  tipo: TipoReporte; titulo: string; descripcion: string; provisional: boolean;
  columnas: { clave: string; titulo: string; numerica?: boolean }[]; filas: Record<string, string | number | null>[];
  desde: string; hasta: string; generado: string; truncado: boolean;
}

const MAX_DIAS = 366;
const MAX_FILAS_DETALLE = 2000;
// El período se agrupa por día o por mes; la unidad viaja como parámetro, nunca dentro del texto de la consulta.
const PERIODO = "to_char(per, CASE WHEN $3 = 'month' THEN 'MM/YYYY' ELSE 'DD/MM/YYYY' END)";

function validar(f: FiltroReporte) {
  const d = Date.parse(`${f.desde}T00:00:00Z`); const h = Date.parse(`${f.hasta}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(h)) throw new ErrorApi(422, "FECHA_INVALIDA", "Las fechas no son válidas.");
  if (h < d) throw new ErrorApi(422, "RANGO_INVALIDO", "La fecha final no puede ser anterior a la inicial.");
  if ((h - d) / 86400000 >= MAX_DIAS) throw new ErrorApi(422, "RANGO_MUY_LARGO", `El rango no puede pasar de ${MAX_DIAS} días.`);
}

// La edad se calcula a la fecha de la visita; un dato de nacimiento incoherente no debe tumbar el reporte.
function edadEn(nacimiento: string | null, fecha: string, aprox: number | null): string {
  if (nacimiento) { try { return calcularEdad(nacimiento, fecha).texto; } catch { return "—"; } }
  return aprox !== null ? `unos ${aprox} años` : "—";
}

const num = (clave: string, titulo: string) => ({ clave, titulo, numerica: true });

// Los reportes son de lectura, solo para administradores. Todos reciben el rango [desde, hasta] (hasta incluido).
export async function generarReporte(pool: pg.Pool, actor: Actor, tipo: TipoReporte, f: FiltroReporte): Promise<Reporte> {
  validar(f);
  const p = [f.desde, f.hasta, f.agrupar];
  const base = { tipo, desde: f.desde, hasta: f.hasta, generado: new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" }), truncado: false };
  const q = async (sql: string) => (await pool.query(sql, p)).rows;

  switch (tipo) {
    case "atenciones": return { ...base, titulo: "Atenciones por período y tipo", provisional: false, descripcion: "Atenciones que llegaron al centro, según su estado final.",
      columnas: [{ clave: "periodo", titulo: "Período" }, { clave: "tipo", titulo: "Tipo de atención" }, num("total", "Total"), num("finalizadas", "Finalizadas"), num("se_retiro", "Se retiraron"), num("no_concluidas", "No concluidas"), num("abiertas", "Abiertas")],
      filas: await q(`SELECT ${PERIODO} AS periodo, tipo, count(*)::int AS total, count(*) FILTER (WHERE estado = 'finalizada')::int AS finalizadas,
          count(*) FILTER (WHERE estado = 'se_retiro')::int AS se_retiro, count(*) FILTER (WHERE estado = 'no_concluida')::int AS no_concluidas,
          count(*) FILTER (WHERE estado IN ('en_espera', 'enviado', 'en_atencion'))::int AS abiertas
        FROM (SELECT date_trunc($3, a.fecha_hora_llegada) AS per, ta.nombre_tipo_atencion AS tipo, a.estado FROM atenciones a JOIN tipos_atencion ta USING (id_tipo_atencion)
               WHERE a.fecha_hora_llegada >= $1::date AND a.fecha_hora_llegada < $2::date + 1) x GROUP BY per, tipo ORDER BY per, tipo`) };
    case "pacientes-por-area": return { ...base, titulo: "Pacientes atendidos por área", provisional: false, descripcion: "Pacientes distintos y atenciones en las que cada área llegó a atender (se llamó al paciente).",
      columnas: [{ clave: "periodo", titulo: "Período" }, { clave: "area", titulo: "Área" }, num("pacientes", "Pacientes distintos"), num("atenciones", "Atenciones atendidas")],
      filas: await q(`SELECT ${PERIODO} AS periodo, area, count(DISTINCT id_paciente)::int AS pacientes, count(DISTINCT id_atencion)::int AS atenciones
        FROM (SELECT date_trunc($3, r.fecha_hora_inicio) AS per, ar.nombre_area AS area, a.id_paciente, a.id_atencion FROM recorridos_atencion r JOIN areas ar USING (id_area) JOIN atenciones a USING (id_atencion)
               WHERE r.fecha_hora_inicio >= $1::date AND r.fecha_hora_inicio < $2::date + 1) x GROUP BY per, area ORDER BY per, area`) };
    case "tiempos-espera": return { ...base, titulo: "Tiempos de espera por área", provisional: false, descripcion: "Minutos entre la llegada del paciente a la cola del área y el momento en que se le llamó, y duración de la atención en el área.",
      columnas: [{ clave: "periodo", titulo: "Período" }, { clave: "area", titulo: "Área" }, num("atendidos", "Atendidos"), num("espera_promedio", "Espera promedio (min)"), num("espera_maxima", "Espera máxima (min)"), num("atencion_promedio", "Duración promedio de la atención (min)"), num("sin_atender", "Salieron sin ser atendidos"), num("se_retiro", "Se retiraron"), num("cierre_dia", "Cerradas al final del día")],
      filas: await q(`SELECT ${PERIODO} AS periodo, area, count(*) FILTER (WHERE inicio IS NOT NULL)::int AS atendidos,
          round(avg(extract(epoch FROM (inicio - entrada)) / 60) FILTER (WHERE inicio IS NOT NULL))::int AS espera_promedio,
          round(max(extract(epoch FROM (inicio - entrada)) / 60) FILTER (WHERE inicio IS NOT NULL))::int AS espera_maxima,
          round(avg(extract(epoch FROM (salida - inicio)) / 60) FILTER (WHERE inicio IS NOT NULL AND salida IS NOT NULL))::int AS atencion_promedio,
          count(*) FILTER (WHERE inicio IS NULL AND salida IS NOT NULL)::int AS sin_atender,
          count(*) FILTER (WHERE inicio IS NULL AND salida IS NOT NULL AND estado = 'se_retiro')::int AS se_retiro,
          count(*) FILTER (WHERE inicio IS NULL AND salida IS NOT NULL AND estado = 'no_concluida')::int AS cierre_dia
        FROM (SELECT date_trunc($3, r.fecha_hora_entrada) AS per, ar.nombre_area AS area, r.fecha_hora_entrada AS entrada, r.fecha_hora_inicio AS inicio, r.fecha_hora_salida AS salida, a.estado
                FROM recorridos_atencion r JOIN areas ar USING (id_area) JOIN atenciones a USING (id_atencion) WHERE ar.nombre_area <> 'recepción' AND r.fecha_hora_entrada >= $1::date AND r.fecha_hora_entrada < $2::date + 1) x
        GROUP BY per, area ORDER BY per, area`) };
    case "medicamentos-entregados": return { ...base, titulo: "Medicamentos entregados", provisional: true, descripcion: "Entregas de farmacia en el rango, por medicamento (provisional hasta definir el formato de farmacia).",
      columnas: [{ clave: "medicamento", titulo: "Medicamento" }, { clave: "presentacion", titulo: "Presentación" }, num("entregas", "Entregas"), num("recetado", "Recetado"), num("entregado", "Entregado"), num("no_entregado", "No entregado")],
      filas: await q(`SELECT min(d.medicamento_texto) AS medicamento, min(d.presentacion_texto) AS presentacion, count(DISTINCT e.id_entrega_farmacia)::int AS entregas,
          sum(d.cantidad_recetada)::int AS recetado, sum(ed.cantidad_entregada)::int AS entregado, sum(ed.cantidad_no_entregada)::int AS no_entregado
        FROM entregas_farmacia e JOIN entregas_farmacia_detalle ed USING (id_entrega_farmacia) JOIN recetas_detalle d USING (id_receta_detalle)
        WHERE e.fecha_hora >= $1::date AND e.fecha_hora < $2::date + 1 AND $3::text IS NOT NULL
        GROUP BY lower(trim(d.medicamento_texto)), lower(trim(d.presentacion_texto)) ORDER BY 1, 2`) };
    case "vacunas-aplicadas": return { ...base, titulo: "Vacunas aplicadas", provisional: true, descripcion: "Dosis aplicadas por vacuna y número de dosis, según sexo (provisional hasta confirmar el formato de vacunación).",
      columnas: [{ clave: "vacuna", titulo: "Vacuna" }, num("dosis", "Dosis"), num("total", "Total"), num("mujeres", "Mujeres"), num("hombres", "Hombres")],
      filas: await q(`SELECT min(v.nombre_vacuna_texto) AS vacuna, v.numero_dosis AS dosis, count(*)::int AS total, count(*) FILTER (WHERE pa.sexo = 'F')::int AS mujeres, count(*) FILTER (WHERE pa.sexo = 'M')::int AS hombres
        FROM vacunas_aplicadas v JOIN atenciones a USING (id_atencion) JOIN pacientes pa USING (id_paciente)
        WHERE v.vigente AND v.fecha_aplicacion >= $1::date AND v.fecha_aplicacion <= $2::date AND $3::text IS NOT NULL GROUP BY lower(trim(v.nombre_vacuna_texto)), v.numero_dosis ORDER BY 1, 2`) };
    case "consultas-diarias": {
      await registrarEvento(pool, { accion: "ver_historial", entidad: "reportes", idUsuario: actor.idUsuario, direccionIp: actor.ip, detalle: `reporte consultas-diarias ${f.desde} a ${f.hasta}` });
      const filas = (await pool.query(
        `SELECT to_char(a.fecha_hora_llegada, 'DD/MM/YYYY') AS fecha, to_char(a.fecha_hora_llegada, 'YYYY-MM-DD') AS fecha_iso, pa.codigo_paciente AS codigo,
                trim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')) AS paciente, pa.sexo, to_char(pa.fecha_nacimiento, 'YYYY-MM-DD') AS nacimiento, pa.edad_aproximada_anios AS edad_aprox,
                coalesce((SELECT string_agg(d.descripcion_diagnostico || coalesce(' (' || d.codigo_cie10 || ')', ''), '; ' ORDER BY d.id_diagnostico_consulta) FROM diagnosticos_consulta d WHERE d.id_consulta = c.id_consulta), '') AS diagnostico,
                coalesce(c.conducta_tratamiento, '') AS tratamiento, (u.nombres || ' ' || u.apellidos) AS doctor
           FROM consultas c JOIN atenciones a USING (id_atencion) JOIN pacientes pa USING (id_paciente) JOIN usuarios u ON u.id_usuario = c.id_usuario
          WHERE c.vigente AND a.fecha_hora_llegada >= $1::date AND a.fecha_hora_llegada < $2::date + 1 AND $3::text IS NOT NULL ORDER BY a.fecha_hora_llegada, c.id_consulta LIMIT $4`, [...p, MAX_FILAS_DETALLE + 1])).rows;
      const truncado = filas.length > MAX_FILAS_DETALLE;
      const salida = filas.slice(0, MAX_FILAS_DETALLE).map((r) => ({
        fecha: r.fecha, codigo: r.codigo, paciente: r.paciente, sexo: r.sexo,
        edad: edadEn(r.nacimiento, r.fecha_iso, r.edad_aprox),
        diagnostico: r.diagnostico, tratamiento: r.tratamiento, doctor: r.doctor,
      }));
      return { ...base, truncado, titulo: "Registro diario de consultas", provisional: true, descripcion: "Una fila por consulta médica, con los datos que pide el registro diario de consulta del MSPAS (solo consulta médica; formato por confirmar con la coordinadora).",
        columnas: [{ clave: "fecha", titulo: "Fecha" }, { clave: "codigo", titulo: "Código" }, { clave: "paciente", titulo: "Paciente" }, { clave: "sexo", titulo: "Sexo" }, { clave: "edad", titulo: "Edad" }, { clave: "diagnostico", titulo: "Diagnóstico (CIE-10)" }, { clave: "tratamiento", titulo: "Tratamiento" }, { clave: "doctor", titulo: "Atendió" }],
        filas: salida };
    }
  }
}
