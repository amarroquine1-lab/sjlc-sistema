import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import { calcularImc, esMenorDeEdad, kgALibra, libraAKg } from "../../servicios/calculos.js";
import { tramoActual, type UsuarioActor } from "../cola/servicio.js";

export interface DatosSignos {
  peso_lb?: number | null; talla_cm?: number | null; temperatura_c?: number | null; presion_sistolica?: number | null;
  presion_diastolica?: number | null; frecuencia_cardiaca?: number | null; saturacion_oxigeno?: number | null;
  hay_signos_peligro?: boolean; detalle_signos_peligro?: string | null;
}

const COLUMNAS = `s.id_signo_vital, s.id_atencion, s.peso_kg::float8 AS peso_kg, s.talla_cm::float8 AS talla_cm, s.temperatura_c::float8 AS temperatura_c,
  s.presion_sistolica, s.presion_diastolica, s.frecuencia_cardiaca, s.saturacion_oxigeno, s.hay_signos_peligro, s.detalle_signos_peligro,
  s.vigente, s.corrige_a, to_char(s.fecha_creacion, 'DD/MM/YYYY HH24:MI') AS registrado, (u.nombres || ' ' || u.apellidos) AS registrado_por`;

// La base guarda kilogramos; hacia afuera el peso siempre sale en libras (el IMC se calcula con los kilogramos guardados).
const enLibras = <T extends { peso_kg: number | null }>(s: T) => {
  const { peso_kg, ...resto } = s;
  return { ...resto, peso_lb: peso_kg === null ? null : kgALibra(peso_kg) };
};

// Signos vigentes de la atención con el IMC calculado (no se guarda).
export async function signosVigentes(c: pg.Pool | pg.PoolClient, idAtencion: number, idPaciente: number) {
  const r = await c.query(`SELECT ${COLUMNAS} FROM signos_vitales s JOIN usuarios u ON u.id_usuario = s.id_usuario WHERE s.id_atencion = $1 AND s.vigente`, [idAtencion]);
  const s = r.rows[0];
  if (!s) return null;
  const p = await c.query("SELECT to_char(fecha_nacimiento, 'YYYY-MM-DD') AS f, edad_aproximada_anios AS e, to_char(current_date, 'YYYY-MM-DD') AS hoy FROM pacientes WHERE id_paciente = $1", [idPaciente]);
  const adulto = p.rows[0].f ? !esMenorDeEdad(p.rows[0].f, p.rows[0].hoy) : (p.rows[0].e ?? 0) >= 18;
  return { ...enLibras(s), imc: calcularImc(s.peso_kg, s.talla_cm, adulto) };
}

export async function historialSignos(pool: pg.Pool, idAtencion: number) {
  const r = await pool.query(`SELECT ${COLUMNAS} FROM signos_vitales s JOIN usuarios u ON u.id_usuario = s.id_usuario WHERE s.id_atencion = $1 ORDER BY s.id_signo_vital`, [idAtencion]);
  return r.rows.map(enLibras);
}

// Registra los signos de la atención que se está atendiendo en signos vitales. Si ya había, se corrige:
// el anterior queda como no vigente y el nuevo apunta a él (nada clínico se borra).
export async function registrarSignos(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d: DatosSignos) {
  const campos = [d.peso_lb, d.talla_cm, d.temperatura_c, d.presion_sistolica, d.frecuencia_cardiaca, d.saturacion_oxigeno];
  if (campos.every((v) => v === undefined || v === null)) throw new ErrorApi(422, "SIGNOS_VACIOS", "Escriba al menos un signo vital.");
  if ((d.presion_sistolica == null) !== (d.presion_diastolica == null)) throw new ErrorApi(422, "PRESION_INCOMPLETA", "La presión arterial lleva los dos valores: alta y baja.");
  if (d.presion_sistolica != null && d.presion_diastolica != null && d.presion_diastolica >= d.presion_sistolica) {
    throw new ErrorApi(422, "PRESION_INVALIDA", "La presión baja debe ser menor que la alta.");
  }
  const a = await pool.query("SELECT id_paciente FROM atenciones WHERE id_atencion = $1", [idAtencion]);
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    // El tramo se revisa con la fila bloqueada: si la atención se envió o cerró mientras tanto, no se guarda nada.
    const t = await tramoActual(c, actor, idAtencion, true);
    if (t.nombre_area !== "signos vitales" && actor.rol !== "administrador") throw new ErrorApi(403, "OTRA_AREA", "Los signos se registran en signos vitales.");
    const previo = await c.query("SELECT id_signo_vital FROM signos_vitales WHERE id_atencion = $1 AND vigente FOR UPDATE", [idAtencion]);
    const anterior = previo.rows[0]?.id_signo_vital ?? null;
    if (anterior) await c.query("UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = $1", [anterior]);
    await c.query(
      `INSERT INTO signos_vitales (id_atencion, peso_kg, talla_cm, temperatura_c, presion_sistolica, presion_diastolica, frecuencia_cardiaca,
         saturacion_oxigeno, hay_signos_peligro, detalle_signos_peligro, id_usuario, corrige_a)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [idAtencion, d.peso_lb == null ? null : libraAKg(d.peso_lb), d.talla_cm ?? null, d.temperatura_c ?? null, d.presion_sistolica ?? null, d.presion_diastolica ?? null,
        d.frecuencia_cardiaca ?? null, d.saturacion_oxigeno ?? null, d.hay_signos_peligro ?? false, d.detalle_signos_peligro ?? null, actor.idUsuario, anterior]);
  }).catch((e) => {
    if ((e as { code?: string }).code === "23505") throw new ErrorApi(409, "SIGNOS_CONCURRENTES", "Otra persona guardó los signos al mismo tiempo. Revise y vuelva a intentar.");
    throw e;
  });
  return signosVigentes(pool, idAtencion, a.rows[0].id_paciente);
}
