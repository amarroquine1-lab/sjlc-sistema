import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import { claveDeArea, tramoActual, type UsuarioActor } from "../cola/servicio.js";

export interface DatosConsulta {
  tipo_consulta: "primera" | "reconsulta" | "control"; motivo_consulta: string; historia_enfermedad?: string | null;
  semana_gestacion?: number | null; conducta_tratamiento?: string | null; problemas_identificados?: string | null; referido_a?: string | null;
  diagnosticos: { descripcion_diagnostico: string; codigo_cie10?: string | null }[];
}
export interface LineaReceta { medicamento: string; presentacion: string; cantidad_recetada: number; indicaciones: string }

const AREAS_QUE_RECETAN = ["doctor", "nutrición"];

// Consulta del doctor. Si ya había una, se corrige: la anterior queda no vigente y la nueva apunta a ella (nada clínico se borra).
export async function guardarConsulta(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d: DatosConsulta) {
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    if (t.nombre_area !== "doctor") throw new ErrorApi(403, "OTRA_AREA", "La consulta se registra en el área del doctor.");
    if (d.semana_gestacion != null) {
      const sx = await c.query("SELECT p.sexo FROM atenciones a JOIN pacientes p USING (id_paciente) WHERE a.id_atencion = $1", [idAtencion]);
      if (sx.rows[0]?.sexo !== "F") throw new ErrorApi(422, "DATO_NO_APLICA", "La semana de gestación solo aplica a pacientes de sexo femenino.");
    }
    const previo = await c.query("SELECT id_consulta FROM consultas WHERE id_atencion = $1 AND vigente FOR UPDATE", [idAtencion]);
    const anterior = previo.rows[0]?.id_consulta ?? null;
    if (anterior) await c.query("UPDATE consultas SET vigente = false WHERE id_consulta = $1", [anterior]);
    const n = await c.query(
      `INSERT INTO consultas (id_atencion, id_usuario, tipo_consulta, motivo_consulta, historia_enfermedad, semana_gestacion, conducta_tratamiento,
         problemas_identificados, referido_a, corrige_a) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_consulta`,
      [idAtencion, actor.idUsuario, d.tipo_consulta, d.motivo_consulta, d.historia_enfermedad ?? null, d.semana_gestacion ?? null,
        d.conducta_tratamiento ?? null, d.problemas_identificados ?? null, d.referido_a ?? null, anterior]);
    for (const x of d.diagnosticos) {
      await c.query("INSERT INTO diagnosticos_consulta (id_consulta, descripcion_diagnostico, codigo_cie10) VALUES ($1, $2, $3)",
        [n.rows[0].id_consulta, x.descripcion_diagnostico, x.codigo_cie10 ?? null]);
    }
  });
  return datosClinicos(pool, idAtencion, "doctor");
}

// Receta del área que atiende (doctor o nutrición). Una sola vigente por atención y área; una lista vacía la deja sin efecto.
export async function guardarReceta(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, lineas: LineaReceta[]) {
  let claveArea = "";
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    claveArea = claveDeArea(t.nombre_area) ?? "";
    if (!AREAS_QUE_RECETAN.includes(t.nombre_area)) throw new ErrorApi(403, "OTRA_AREA", "Solo doctor y nutrición hacen recetas.");
    if (t.nombre_area === "doctor" && actor.rol === "nutricion") throw new ErrorApi(403, "OTRA_AREA", "Esta atención está en otra área.");
    const claves = new Set(lineas.map((l) => `${l.medicamento.toLowerCase()}|${l.presentacion.toLowerCase()}`));
    if (claves.size !== lineas.length) throw new ErrorApi(422, "MEDICAMENTO_REPETIDO", "Un medicamento con la misma presentación aparece dos veces en la receta.");
    const area = await c.query("SELECT id_area FROM areas WHERE nombre_area = $1", [t.nombre_area]);
    const previo = await c.query("SELECT id_receta FROM recetas WHERE id_atencion = $1 AND id_area = $2 AND vigente FOR UPDATE", [idAtencion, area.rows[0].id_area]);
    const anterior = previo.rows[0]?.id_receta ?? null;
    if (anterior) await c.query("UPDATE recetas SET vigente = false WHERE id_receta = $1", [anterior]);
    if (!lineas.length) return;
    const n = await c.query("INSERT INTO recetas (id_atencion, id_area, id_usuario, corrige_a) VALUES ($1, $2, $3, $4) RETURNING id_receta",
      [idAtencion, area.rows[0].id_area, actor.idUsuario, anterior]);
    for (const l of lineas) {
      await c.query("INSERT INTO recetas_detalle (id_receta, medicamento_texto, presentacion_texto, cantidad_recetada, indicaciones) VALUES ($1, $2, $3, $4, $5)",
        [n.rows[0].id_receta, l.medicamento, l.presentacion, l.cantidad_recetada, l.indicaciones]);
    }
  });
  return datosClinicos(pool, idAtencion, claveArea);
}

// Pendiente para una próxima visita (cada área puede dejar uno; "Al buscar al paciente, recepción ve sus pendientes").
export async function guardarProximoControl(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d: { area: "doctor" | "nutricion" | "vacunacion"; descripcion: string; fecha_sugerida?: string | null }) {
  let areaActual = "";
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    areaActual = claveDeArea((await tramoActual(c, actor, idAtencion, true)).nombre_area) ?? "";
    const nombre = { doctor: "doctor", nutricion: "nutrición", vacunacion: "vacunación" }[d.area];
    if (d.fecha_sugerida && d.fecha_sugerida < (await c.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS hoy")).rows[0].hoy) {
      throw new ErrorApi(422, "FECHA_PASADA", "La fecha sugerida no puede ser anterior a hoy.");
    }
    await c.query(
      `INSERT INTO proximos_controles (id_paciente, id_atencion, id_area, descripcion, fecha_sugerida, id_usuario)
       SELECT a.id_paciente, a.id_atencion, ar.id_area, $2, $3, $4 FROM atenciones a, areas ar WHERE a.id_atencion = $1 AND ar.nombre_area = $5`,
      [idAtencion, d.descripcion, d.fecha_sugerida ?? null, actor.idUsuario, nombre]);
  });
  return datosClinicos(pool, idAtencion, areaActual);
}

// Lo clínico de la atención. El historial resumido solo se entrega al doctor (datos mínimos por área).
export async function datosClinicos(c: pg.Pool | pg.PoolClient, idAtencion: number, clave: string) {
  const consulta = await c.query(
    `SELECT c.id_consulta, c.tipo_consulta, c.motivo_consulta, c.historia_enfermedad, c.semana_gestacion, c.conducta_tratamiento, c.problemas_identificados,
            c.referido_a, to_char(c.fecha_creacion, 'DD/MM/YYYY HH24:MI') AS registrada, (u.nombres || ' ' || u.apellidos) AS registrada_por
       FROM consultas c JOIN usuarios u USING (id_usuario) WHERE c.id_atencion = $1 AND c.vigente`, [idAtencion]);
  let diagnosticos: unknown[] = [];
  if (consulta.rows[0]) {
    diagnosticos = (await c.query("SELECT descripcion_diagnostico, codigo_cie10 FROM diagnosticos_consulta WHERE id_consulta = $1 ORDER BY id_diagnostico_consulta", [consulta.rows[0].id_consulta])).rows;
  }
  const recetas = await c.query(
    `SELECT r.id_receta, ar.nombre_area AS area, d.medicamento_texto AS medicamento, d.presentacion_texto AS presentacion, d.cantidad_recetada, d.indicaciones
       FROM recetas r JOIN areas ar USING (id_area) JOIN recetas_detalle d USING (id_receta)
      WHERE r.id_atencion = $1 AND r.vigente ORDER BY r.id_receta, d.id_receta_detalle`, [idAtencion]);
  const controles = await c.query(
    `SELECT pc.id_proximo_control, ar.nombre_area AS area, pc.descripcion, to_char(pc.fecha_sugerida, 'DD/MM/YYYY') AS fecha_sugerida, pc.estado
       FROM proximos_controles pc JOIN areas ar USING (id_area) WHERE pc.id_atencion = $1 ORDER BY pc.id_proximo_control`, [idAtencion]);
  let historial: unknown[] = [];
  if (clave === "doctor") {
    historial = (await c.query(
      `SELECT a.numero_atencion, to_char(a.fecha_hora_llegada, 'DD/MM/YYYY') AS fecha, ta.nombre_tipo_atencion AS tipo, a.estado,
              co.motivo_consulta, co.conducta_tratamiento,
              coalesce((SELECT string_agg(dc.descripcion_diagnostico, '; ' ORDER BY dc.id_diagnostico_consulta) FROM diagnosticos_consulta dc WHERE dc.id_consulta = co.id_consulta), '') AS diagnosticos
         FROM atenciones a JOIN tipos_atencion ta USING (id_tipo_atencion) LEFT JOIN consultas co ON co.id_atencion = a.id_atencion AND co.vigente
        WHERE a.id_paciente = (SELECT id_paciente FROM atenciones WHERE id_atencion = $1) AND a.id_atencion <> $1
        ORDER BY a.fecha_hora_llegada DESC LIMIT 5`, [idAtencion])).rows;
  }
  return { consulta: consulta.rows[0] ? { ...consulta.rows[0], diagnosticos } : null, receta: recetas.rows, proximos_controles: controles.rows, historial_resumido: historial };
}

export async function listarMedicamentos(pool: pg.Pool, q: string | undefined) {
  const r = await pool.query(
    `SELECT m.id_medicamento, m.nombre_medicamento, p.nombre_presentacion AS presentacion, m.concentracion
       FROM medicamentos m JOIN presentaciones p USING (id_presentacion)
      WHERE m.activo AND ($1::text IS NULL OR unaccent_inmutable(m.nombre_medicamento) ILIKE unaccent_inmutable($1))
      ORDER BY m.nombre_medicamento, m.concentracion NULLS FIRST LIMIT 30`, [q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null]);
  return r.rows;
}

export async function crearMedicamento(pool: pg.Pool, actor: UsuarioActor, d: { nombre_medicamento: string; presentacion: string; concentracion?: string | null }) {
  return conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const presentacion = d.presentacion.trim().toLowerCase();
    await c.query("INSERT INTO presentaciones (nombre_presentacion) VALUES ($1) ON CONFLICT (nombre_presentacion) DO NOTHING", [presentacion]);
    const r = await c.query(
      `INSERT INTO medicamentos (nombre_medicamento, id_presentacion, concentracion)
       SELECT $1, id_presentacion, $3 FROM presentaciones WHERE nombre_presentacion = $2 RETURNING id_medicamento`, [d.nombre_medicamento, presentacion, d.concentracion ?? null]);
    return { id_medicamento: r.rows[0].id_medicamento as number };
  });
}

export async function cambiarEstadoMedicamento(pool: pg.Pool, actor: UsuarioActor, id: number, activo: boolean) {
  return conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const r = await c.query("UPDATE medicamentos SET activo = $2 WHERE id_medicamento = $1 RETURNING id_medicamento, activo", [id, activo]);
    if (!r.rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "El medicamento no existe.");
    return r.rows[0];
  });
}

// Sugerencias para escribir la receta: lo que ya se recetó antes (no es un catálogo; se acepta cualquier texto).
export async function sugerirReceta(pool: pg.Pool, campo: "medicamento" | "presentacion", q: string) {
  const patron = `${q.replace(/[\\%_]/g, "\\$&")}%`;
  const r = await pool.query(
    campo === "medicamento"
      ? "SELECT medicamento_texto AS texto, count(*)::int AS veces FROM recetas_detalle d JOIN recetas r USING (id_receta) WHERE r.vigente AND public.unaccent_inmutable(lower(medicamento_texto)) LIKE public.unaccent_inmutable(lower($1)) GROUP BY medicamento_texto ORDER BY veces DESC, texto LIMIT 10"
      : "SELECT presentacion_texto AS texto, count(*)::int AS veces FROM recetas_detalle d JOIN recetas r USING (id_receta) WHERE r.vigente AND public.unaccent_inmutable(lower(presentacion_texto)) LIKE public.unaccent_inmutable(lower($1)) GROUP BY presentacion_texto ORDER BY veces DESC, texto LIMIT 10",
    [patron]);
  return r.rows.map((x) => x.texto as string);
}
