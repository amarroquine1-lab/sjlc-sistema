import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import type { Configuracion } from "../../configuracion.js";
import { nombreCorto } from "../../servicios/calculos.js";
import { obtenerPaciente, type Actor } from "../pacientes/servicio.js";

// Primera área a la que va una atención: la emergencia entra directo al doctor; el resto, a signos vitales.
// (Ruta sugerida, no rígida: sección 10.2 de la especificación.)
async function primeraArea(c: pg.Pool | pg.PoolClient, esEmergencia: boolean): Promise<number> {
  const r = await c.query("SELECT id_area FROM areas WHERE nombre_area = $1", [esEmergencia ? "doctor" : "signos vitales"]);
  if (!r.rows[0]) throw new ErrorApi(500, "CATALOGO_INCOMPLETO", "Falta configurar las áreas del centro.");
  return r.rows[0].id_area;
}

export async function listarTipos(pool: pg.Pool) {
  const r = await pool.query("SELECT id_tipo_atencion, nombre_tipo_atencion, es_emergencia FROM tipos_atencion WHERE activo ORDER BY id_tipo_atencion");
  return r.rows;
}

export async function abrirAtencion(pool: pg.Pool, actor: Actor, idPaciente: number, idTipo: number) {
  const paciente = await obtenerPaciente(pool, idPaciente);
  if (paciente.id_paciente_principal) throw new ErrorApi(409, "PACIENTE_UNIDO", "Este registro fue unido a otro. Abra la atención en el registro vigente.");
  if (paciente.atencion_abierta) {
    throw new ErrorApi(409, "ATENCION_ABIERTA", `El paciente ya tiene una atención abierta (${paciente.atencion_abierta.numero_atencion}).`, { atencion: paciente.atencion_abierta });
  }
  const t = await pool.query("SELECT id_tipo_atencion, es_emergencia FROM tipos_atencion WHERE id_tipo_atencion = $1 AND activo", [idTipo]);
  if (!t.rows[0]) throw new ErrorApi(422, "TIPO_NO_VALIDO", "El tipo de atención no existe.");
  const area = await primeraArea(pool, t.rows[0].es_emergencia);
  let idAtencion: number;
  try {
    idAtencion = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
      // Si otra sesión unió este registro mientras tanto, no se abre la atención sobre un registro absorbido.
      const v = await c.query("SELECT id_paciente_principal FROM pacientes WHERE id_paciente = $1 FOR SHARE", [idPaciente]);
      if (v.rows[0]?.id_paciente_principal) throw new ErrorApi(409, "PACIENTE_UNIDO", "Este registro fue unido a otro. Abra la atención en el registro vigente.");
      const a = await c.query("INSERT INTO atenciones (id_paciente, id_tipo_atencion, estado, id_usuario) VALUES ($1, $2, 'en_espera', $3) RETURNING id_atencion", [idPaciente, idTipo, actor.idUsuario]);
      await c.query("INSERT INTO recorridos_atencion (id_atencion, id_area) VALUES ($1, $2)", [a.rows[0].id_atencion, area]);
      return a.rows[0].id_atencion as number;
    });
  } catch (error) {
    if ((error as { code?: string; constraint?: string }).constraint === "ux_atenciones_abierta_por_paciente") {
      throw new ErrorApi(409, "ATENCION_ABIERTA", "El paciente ya tiene una atención abierta.");
    }
    throw error;
  }
  return obtenerAtencion(pool, idAtencion);
}

const SQL_ATENCION = `SELECT a.id_atencion, a.numero_atencion, a.id_paciente, a.estado, to_char(a.fecha_hora_llegada, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS fecha_hora_llegada,
    to_char(a.fecha_hora_llegada, 'DD/MM/YYYY HH24:MI') AS llegada_texto, ta.nombre_tipo_atencion AS tipo, ta.es_emergencia,
    p.codigo_paciente, p.nombres, p.apellidos,
    (SELECT ar.nombre_area FROM recorridos_atencion r JOIN areas ar ON ar.id_area = r.id_area WHERE r.id_atencion = a.id_atencion AND r.fecha_hora_salida IS NULL LIMIT 1) AS area_actual
  FROM atenciones a JOIN tipos_atencion ta ON ta.id_tipo_atencion = a.id_tipo_atencion JOIN pacientes p ON p.id_paciente = a.id_paciente`;

export async function obtenerAtencion(pool: pg.Pool, id: number) {
  const r = await pool.query(`${SQL_ATENCION} WHERE a.id_atencion = $1`, [id]);
  if (!r.rows[0]) throw new ErrorApi(404, "ATENCION_NO_ENCONTRADA", "No se encontró la atención.");
  return r.rows[0];
}

export async function listarAbiertas(pool: pg.Pool) {
  const r = await pool.query(`${SQL_ATENCION} WHERE a.estado IN ('en_espera', 'en_atencion', 'enviado') ORDER BY ta.es_emergencia DESC, a.fecha_hora_llegada LIMIT 200`);
  return r.rows;
}

export async function marcarSeRetiro(pool: pg.Pool, actor: Actor, id: number) {
  await obtenerAtencion(pool, id);
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    // Se revisa el estado con la fila bloqueada: otra sesión pudo enviarla, cerrarla o llamarla mientras tanto.
    const v = await c.query(
      `SELECT a.estado, (SELECT u.nombres || ' ' || u.apellidos FROM recorridos_atencion r JOIN usuarios u ON u.id_usuario = r.id_usuario
                          WHERE r.id_atencion = a.id_atencion AND r.fecha_hora_salida IS NULL AND r.fecha_hora_inicio IS NOT NULL LIMIT 1) AS atiende
         FROM atenciones a WHERE a.id_atencion = $1 FOR UPDATE`, [id]);
    const estado = v.rows[0].estado as string;
    if (!["en_espera", "enviado", "en_atencion"].includes(estado)) throw new ErrorApi(409, "ATENCION_CERRADA", "La atención ya está cerrada.");
    if (estado === "en_atencion") throw new ErrorApi(409, "ATENCION_EN_CURSO", `El paciente está siendo atendido por ${v.rows[0].atiende ?? "personal del área"}. Avise a esa persona para que termine la atención.`);
    await c.query("UPDATE recorridos_atencion SET fecha_hora_salida = GREATEST(now(), fecha_hora_entrada, coalesce(fecha_hora_inicio, fecha_hora_entrada)) WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [id]);
    await c.query("UPDATE atenciones SET estado = 'se_retiro', fecha_hora_cierre = now() WHERE id_atencion = $1", [id]);
  });
  return obtenerAtencion(pool, id);
}

// Datos del ticket de 80 mm: sin DPI ni datos sensibles (sección 10.5 de la especificación).
export async function datosTicket(pool: pg.Pool, config: Configuracion, id: number) {
  const a = await obtenerAtencion(pool, id);
  return {
    centro: config.centro.nombre, codigo_paciente: a.codigo_paciente, numero_atencion: a.numero_atencion, fecha_hora: a.llegada_texto,
    tipo: a.tipo, es_emergencia: a.es_emergencia, nombre: nombreCorto(a.nombres, a.apellidos), codigo_barras: a.numero_atencion,
  };
}
