import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { registrarEventoEn } from "../../bitacora/servicio.js";
import { ErrorApi } from "../../comun/errores.js";
import type { Configuracion } from "../../configuracion.js";
import { calcularEdad, esMenorDeEdad, revisarCui } from "../../servicios/calculos.js";
import { clasificar } from "./busqueda.js";

export interface Actor { idUsuario: number; ip: string | null }
type Cliente = pg.Pool | pg.PoolClient;

const BASE = `SELECT p.id_paciente, p.codigo_paciente, p.nombres, p.apellidos,
    to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, p.edad_aproximada_anios, p.sexo, p.cui, p.telefono, p.direccion,
    p.id_municipio_residencia, m.nombre_municipio AS municipio_residencia, p.zona_residencia, p.id_colonia_sector,
    cs.nombre_colonia_sector AS colonia_sector, p.id_pueblo, p.id_comunidad_linguistica, p.numero_registro_libro,
    p.datos_incompletos, p.id_paciente_principal, to_char(current_date, 'YYYY-MM-DD') AS hoy,
    ab.id_atencion AS ab_id, ab.numero_atencion AS ab_numero, ab.estado AS ab_estado, ab.tipo AS ab_tipo,
    ab.es_emergencia AS ab_emergencia, ab.area_actual AS ab_area
  FROM pacientes p
  LEFT JOIN municipios m ON m.id_municipio = p.id_municipio_residencia
  LEFT JOIN colonias_sectores cs ON cs.id_colonia_sector = p.id_colonia_sector
  LEFT JOIN LATERAL (
    SELECT a.id_atencion, a.numero_atencion, a.estado, ta.nombre_tipo_atencion AS tipo, ta.es_emergencia,
           (SELECT ar.nombre_area FROM recorridos_atencion r JOIN areas ar ON ar.id_area = r.id_area
             WHERE r.id_atencion = a.id_atencion AND r.fecha_hora_salida IS NULL LIMIT 1) AS area_actual
      FROM atenciones a JOIN tipos_atencion ta ON ta.id_tipo_atencion = a.id_tipo_atencion
     WHERE a.id_paciente = p.id_paciente AND a.estado IN ('en_espera', 'en_atencion', 'enviado') LIMIT 1) ab ON true`;

function dar(f: any) {
  const edad = f.fecha_nacimiento ? calcularEdad(f.fecha_nacimiento, f.hoy) : null;
  const { hoy: _h, ab_id, ab_numero, ab_estado, ab_tipo, ab_emergencia, ab_area, ...resto } = f;
  return {
    ...resto,
    edad,
    es_menor: edad ? edad.anios < 18 : (f.edad_aproximada_anios ?? 99) < 18,
    atencion_abierta: ab_id ? { id_atencion: ab_id, numero_atencion: ab_numero, estado: ab_estado, tipo: ab_tipo, es_emergencia: ab_emergencia, area_actual: ab_area } : null,
  };
}

async function encargadosDe(c: Cliente, ids: number[]): Promise<Map<number, any[]>> {
  const mapa = new Map<number, any[]>();
  if (ids.length === 0) return mapa;
  const r = await c.query(
    `SELECT pe.id_paciente, e.id_encargado, e.nombres, e.apellidos, e.dpi, e.telefono, pe.parentesco, pe.es_principal
       FROM pacientes_encargados pe JOIN encargados e ON e.id_encargado = pe.id_encargado
      WHERE pe.id_paciente = ANY($1::int[]) ORDER BY pe.es_principal DESC, e.id_encargado`, [ids]);
  for (const f of r.rows) { const l = mapa.get(f.id_paciente) ?? []; l.push(f); mapa.set(f.id_paciente, l); }
  return mapa;
}

async function pendientesDe(c: Cliente, ids: number[]): Promise<Map<number, any[]>> {
  const mapa = new Map<number, any[]>();
  if (ids.length === 0) return mapa;
  const r = await c.query(
    `SELECT pc.id_paciente, pc.id_proximo_control, pc.descripcion, to_char(pc.fecha_sugerida, 'YYYY-MM-DD') AS fecha_sugerida, a.nombre_area AS area
       FROM proximos_controles pc JOIN areas a ON a.id_area = pc.id_area
      WHERE pc.id_paciente = ANY($1::int[]) AND pc.estado = 'pendiente' ORDER BY pc.fecha_sugerida NULLS LAST, pc.id_proximo_control`, [ids]);
  for (const f of r.rows) { const l = mapa.get(f.id_paciente) ?? []; l.push(f); mapa.set(f.id_paciente, l); }
  return mapa;
}

async function completar(c: Cliente, filas: any[]) {
  const pacientes = filas.map(dar);
  const ids = pacientes.map((p) => p.id_paciente as number);
  const [enc, pen] = await Promise.all([encargadosDe(c, ids), pendientesDe(c, ids)]);
  return pacientes.map((p) => ({ ...p, encargados: enc.get(p.id_paciente) ?? [], pendientes: pen.get(p.id_paciente) ?? [] }));
}

export async function obtenerPaciente(c: Cliente, id: number) {
  const r = await c.query(`${BASE} WHERE p.id_paciente = $1`, [id]);
  if (!r.rows[0]) throw new ErrorApi(404, "PACIENTE_NO_ENCONTRADO", "No se encontró al paciente.");
  const [p] = await completar(c, r.rows);
  return p;
}

// Búsqueda desde un solo campo: código, CUI/DPI (del paciente o del encargado), fecha, número de atención o nombre.
export async function buscarPacientes(pool: pg.Pool, texto: string) {
  const q = clasificar(texto);
  const valores: unknown[] = [];
  let donde = "p.id_paciente_principal IS NULL";
  let orden = "p.apellidos, p.nombres, p.id_paciente";
  switch (q.tipo) {
    case "vacia": return { consulta: q, datos: [] };
    case "codigo": valores.push(q.codigo); donde += " AND p.codigo_paciente = $1"; break;
    case "cui": valores.push(q.cui); donde += " AND (p.cui = $1 OR p.id_paciente IN (SELECT pe.id_paciente FROM pacientes_encargados pe JOIN encargados e ON e.id_encargado = pe.id_encargado WHERE e.dpi = $1))"; break;
    case "fecha": valores.push(q.fecha); donde += " AND p.fecha_nacimiento = $1::date"; break;
    case "atencion": valores.push(q.numero); donde += " AND p.id_paciente IN (SELECT id_paciente FROM atenciones WHERE numero_atencion = $1)"; break;
    case "nombre":
      for (const palabra of q.palabras) {
        valores.push(palabra);
        donde += ` AND public.unaccent_inmutable(lower(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, ''))) LIKE '%' || public.unaccent_inmutable(lower($${valores.length})) || '%'`;
      }
      break;
  }
  const r = await pool.query(`${BASE} WHERE ${donde} ORDER BY ${orden} LIMIT 25`, valores);
  return { consulta: q, datos: await completar(pool, r.rows) };
}

export async function listarIncompletos(pool: pg.Pool) {
  const r = await pool.query(`${BASE} WHERE p.datos_incompletos AND p.id_paciente_principal IS NULL ORDER BY p.id_paciente DESC LIMIT 100`);
  return completar(pool, r.rows);
}

export interface DatosPaciente {
  nombres: string; apellidos: string; fecha_nacimiento: string; sexo: "F" | "M"; cui?: string | null; sin_cui?: boolean;
  telefono?: string | null; direccion?: string | null; id_municipio_residencia?: number; zona_residencia?: number | null;
  id_colonia_sector?: number | null; id_municipio_nacimiento?: number | null; id_pueblo?: number | null; id_comunidad_linguistica?: number;
  numero_registro_libro?: string | null; confirmar_duplicado?: boolean;
  encargado?: { nombres: string; apellidos: string; dpi?: string | null; telefono?: string | null; parentesco: string } | null;
}

async function hoy(c: Cliente): Promise<string> {
  return (await c.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS h")).rows[0].h;
}

export async function advertenciasCui(c: Cliente, cui: string): Promise<string[]> {
  const r = revisarCui(cui);
  const avisos: string[] = [];
  if (!r.verificadorCorrecto) avisos.push("El dígito verificador del CUI no coincide. Revise que esté bien escrito.");
  if (r.codigoMunicipio !== null) {
    const m = await c.query("SELECT 1 FROM municipios WHERE id_municipio = $1", [r.codigoMunicipio]);
    if (!m.rowCount) avisos.push("Los últimos 4 dígitos del CUI no corresponden a un municipio válido.");
  }
  return avisos;
}

async function buscarDuplicados(c: Cliente, d: DatosPaciente) {
  const r = await c.query(
    `${BASE} WHERE p.id_paciente_principal IS NULL AND p.fecha_nacimiento = $1::date
        AND similarity(public.unaccent_inmutable(lower(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, ''))), public.unaccent_inmutable(lower($2))) > 0.45
      ORDER BY p.id_paciente LIMIT 5`, [d.fecha_nacimiento, `${d.nombres} ${d.apellidos}`]);
  return completar(c, r.rows);
}

// La colonia o sector debe estar activa y pertenecer al municipio de residencia.
async function validarColonia(c: Cliente, idColonia: number | null | undefined, idMunicipio: number): Promise<void> {
  if (!idColonia) return;
  const r = await c.query("SELECT 1 FROM colonias_sectores WHERE id_colonia_sector = $1 AND activo AND id_municipio = $2", [idColonia, idMunicipio]);
  if (!r.rowCount) throw new ErrorApi(422, "COLONIA_NO_VALIDA", "La colonia o sector no existe, está desactivada o no es del municipio elegido.");
}

export async function registrarPaciente(pool: pg.Pool, config: Configuracion, actor: Actor, d: DatosPaciente) {
  const fechaHoy = await hoy(pool);
  await validarColonia(pool, d.id_colonia_sector, d.id_municipio_residencia ?? config.centro.idMunicipio);
  if (d.fecha_nacimiento > fechaHoy) throw new ErrorApi(422, "FECHA_NACIMIENTO_FUTURA", "La fecha de nacimiento no puede ser posterior a hoy.");
  const menor = esMenorDeEdad(d.fecha_nacimiento, fechaHoy);
  let avisosCui: string[] = [];
  if (d.cui) {
    avisosCui = await advertenciasCui(pool, d.cui);
    const ya = await pool.query(`${BASE} WHERE p.cui = $1`, [d.cui]);
    if (ya.rows[0]) {
      const [p] = await completar(pool, ya.rows);
      throw new ErrorApi(409, "CUI_DUPLICADO", "Ya existe un paciente con ese CUI.", { paciente: p });
    }
  } else if (!menor && !d.sin_cui) {
    throw new ErrorApi(422, "CUI_REQUERIDO", "Escriba el DPI/CUI de la persona, o confirme que no lo tiene.");
  }
  if (menor && !d.encargado) throw new ErrorApi(422, "ENCARGADO_REQUERIDO", "Para un menor de edad hay que registrar a su encargado (nombre, parentesco y, si lo tiene, DPI).");
  if (!d.confirmar_duplicado) {
    const posibles = await buscarDuplicados(pool, d);
    if (posibles.length) throw new ErrorApi(409, "DUPLICADO_POSIBLE", "Ya existe un paciente parecido (mismo nombre y fecha de nacimiento). Revise antes de registrar otro.", { duplicados: posibles });
  }
  const id = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const r = await c.query(
      `INSERT INTO pacientes (nombres, apellidos, fecha_nacimiento, sexo, cui, telefono, direccion, id_municipio_residencia, zona_residencia,
          id_colonia_sector, id_municipio_nacimiento, id_pueblo, id_comunidad_linguistica, numero_registro_libro, id_usuario)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 99), $14, $15) RETURNING id_paciente`,
      [d.nombres, d.apellidos, d.fecha_nacimiento, d.sexo, d.cui ?? null, d.telefono ?? null, d.direccion ?? null,
        d.id_municipio_residencia ?? config.centro.idMunicipio, d.zona_residencia === undefined ? config.centro.zona : d.zona_residencia,
        d.id_colonia_sector ?? null, d.id_municipio_nacimiento ?? null, d.id_pueblo ?? null, d.id_comunidad_linguistica ?? null,
        d.numero_registro_libro ?? null, actor.idUsuario]);
    const idPaciente = r.rows[0].id_paciente as number;
    if (d.encargado) {
      const e = await c.query("INSERT INTO encargados (nombres, apellidos, dpi, telefono) VALUES ($1, $2, $3, $4) RETURNING id_encargado",
        [d.encargado.nombres, d.encargado.apellidos, d.encargado.dpi ?? null, d.encargado.telefono ?? null]);
      await c.query("INSERT INTO pacientes_encargados (id_paciente, id_encargado, parentesco, es_principal) VALUES ($1, $2, $3, true)",
        [idPaciente, e.rows[0].id_encargado, d.encargado.parentesco]);
    }
    return idPaciente;
  });
  return { paciente: await obtenerPaciente(pool, id), advertencias: avisosCui };
}

// Campos que recepción puede corregir. Los nombres de columna salen de esta lista fija, nunca de la petición.
const EDITABLES: Record<string, string> = {
  nombres: "nombres", apellidos: "apellidos", fecha_nacimiento: "fecha_nacimiento", sexo: "sexo", cui: "cui", telefono: "telefono",
  direccion: "direccion", id_municipio_residencia: "id_municipio_residencia", zona_residencia: "zona_residencia",
  id_colonia_sector: "id_colonia_sector", id_municipio_nacimiento: "id_municipio_nacimiento", id_pueblo: "id_pueblo",
  id_comunidad_linguistica: "id_comunidad_linguistica", numero_registro_libro: "numero_registro_libro",
};

export async function editarPaciente(pool: pg.Pool, actor: Actor, id: number, cambios: Record<string, unknown>) {
  const actual = await obtenerPaciente(pool, id);
  if (actual.id_paciente_principal) throw new ErrorApi(409, "PACIENTE_UNIDO", "Este registro fue unido a otro y ya no se edita.");
  const hoyTexto = await hoy(pool);
  const fechaNueva = (cambios.fecha_nacimiento as string | undefined) ?? actual.fecha_nacimiento;
  const esMenorAhora = fechaNueva ? esMenorDeEdad(fechaNueva, hoyTexto) : false;
  // Un adulto no pierde su CUI por accidente: hay que confirmar que no lo tiene.
  if ("cui" in cambios && !cambios.cui && actual.cui && !esMenorAhora && !cambios.sin_cui) {
    throw new ErrorApi(422, "CUI_REQUERIDO", "Para quitar el DPI/CUI de un adulto confirme que la persona no lo tiene.");
  }
  if ("id_colonia_sector" in cambios || "id_municipio_residencia" in cambios) {
    await validarColonia(pool, (cambios.id_colonia_sector as number | null | undefined) ?? actual.id_colonia_sector,
      (cambios.id_municipio_residencia as number | undefined) ?? actual.id_municipio_residencia ?? 0);
  }
  const sets: string[] = [];
  const valores: unknown[] = [id];
  for (const [clave, valor] of Object.entries(cambios)) {
    const columna = EDITABLES[clave];
    if (!columna) continue;
    valores.push(valor ?? null);
    sets.push(`${columna} = $${valores.length}${clave === "fecha_nacimiento" ? "::date" : ""}`);
  }
  if (cambios.cui) {
    const choque = await pool.query("SELECT id_paciente FROM pacientes WHERE cui = $1 AND id_paciente <> $2", [cambios.cui, id]);
    if (choque.rowCount) throw new ErrorApi(409, "CUI_DUPLICADO", "Otro paciente ya tiene ese CUI.");
  }
  // Un registro de emergencia pasa a completo cuando ya tiene nombres, apellidos y fecha de nacimiento.
  const completo = (cambios.nombres ?? actual.nombres) && (cambios.apellidos ?? actual.apellidos) && (cambios.fecha_nacimiento ?? actual.fecha_nacimiento);
  if (actual.datos_incompletos && completo) {
    // Al completar una emergencia se busca si la persona ya existía (la especificación pide unir los registros).
    if (!cambios.confirmar_duplicado) {
      const posibles = (await buscarDuplicados(pool, {
        nombres: String(cambios.nombres ?? actual.nombres), apellidos: String(cambios.apellidos ?? actual.apellidos), fecha_nacimiento: String(fechaNueva),
      } as DatosPaciente)).filter((x) => x.id_paciente !== id);
      if (posibles.length) throw new ErrorApi(409, "DUPLICADO_POSIBLE", "Ya existe un paciente parecido (mismo nombre y fecha de nacimiento). Si es la misma persona, una los registros desde recepción.", { duplicados: posibles });
    }
    sets.push("datos_incompletos = false");
  }
  if (sets.length === 0) return { paciente: actual, advertencias: [] };
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    await c.query("UPDATE pacientes SET " + sets.join(", ") + " WHERE id_paciente = $1", valores);
  });
  const avisos = typeof cambios.cui === "string" ? await advertenciasCui(pool, cambios.cui) : [];
  return { paciente: await obtenerPaciente(pool, id), advertencias: avisos };
}

export async function agregarEncargado(pool: pg.Pool, actor: Actor, id: number, e: { nombres: string; apellidos: string; dpi?: string | null; telefono?: string | null; parentesco: string }) {
  await obtenerPaciente(pool, id);
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const r = await c.query("INSERT INTO encargados (nombres, apellidos, dpi, telefono) VALUES ($1, $2, $3, $4) RETURNING id_encargado", [e.nombres, e.apellidos, e.dpi ?? null, e.telefono ?? null]);
    const sin = await c.query("SELECT 1 FROM pacientes_encargados WHERE id_paciente = $1 AND es_principal", [id]);
    await c.query("INSERT INTO pacientes_encargados (id_paciente, id_encargado, parentesco, es_principal) VALUES ($1, $2, $3, $4)", [id, r.rows[0].id_encargado, e.parentesco, !sin.rowCount]);
  });
  return obtenerPaciente(pool, id);
}

export async function registrarEmergencia(pool: pg.Pool, actor: Actor, d: { sexo: "F" | "M"; edad_aproximada_anios: number; nombres?: string | null; apellidos?: string | null }) {
  const r = await pool.query(`SELECT t.id_tipo_atencion, (SELECT id_area FROM areas WHERE nombre_area = 'doctor') AS id_area
                                FROM tipos_atencion t WHERE t.es_emergencia AND t.activo ORDER BY t.id_tipo_atencion LIMIT 1`);
  if (!r.rows[0] || !r.rows[0].id_area) throw new ErrorApi(500, "CATALOGO_INCOMPLETO", "Falta configurar el tipo de atención de emergencia.");
  const { id_tipo_atencion, id_area } = r.rows[0];
  const ids = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const p = await c.query(
      `INSERT INTO pacientes (nombres, apellidos, sexo, edad_aproximada_anios, datos_incompletos, id_usuario) VALUES ($1, $2, $3, $4, true, $5) RETURNING id_paciente`,
      [d.nombres ?? null, d.apellidos ?? null, d.sexo, d.edad_aproximada_anios, actor.idUsuario]);
    const a = await c.query("INSERT INTO atenciones (id_paciente, id_tipo_atencion, estado, id_usuario) VALUES ($1, $2, 'en_espera', $3) RETURNING id_atencion",
      [p.rows[0].id_paciente, id_tipo_atencion, actor.idUsuario]);
    await c.query("INSERT INTO recorridos_atencion (id_atencion, id_area) VALUES ($1, $2)", [a.rows[0].id_atencion, id_area]);
    return { idPaciente: p.rows[0].id_paciente as number, idAtencion: a.rows[0].id_atencion as number };
  });
  return { paciente: await obtenerPaciente(pool, ids.idPaciente), id_atencion: ids.idAtencion };
}

export async function unirPacientes(pool: pg.Pool, actor: Actor, idPrincipal: number, idUnido: number, motivo: string) {
  if (idPrincipal === idUnido) throw new ErrorApi(422, "UNION_INVALIDA", "No se puede unir un paciente consigo mismo.");
  const previo = await obtenerPaciente(pool, idPrincipal);
  const previoUnido = await obtenerPaciente(pool, idUnido);
  // El registro de emergencia (incompleto) nunca absorbe a uno completo: conservaría datos adivinados.
  if (previo.datos_incompletos && !previoUnido.datos_incompletos) {
    throw new ErrorApi(422, "UNION_DIRECCION", "El registro con datos completos debe ser el que se conserva. Elija el registro completo como principal.");
  }
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    // Bloqueo de ambas filas (en orden, para no provocar interbloqueos) y nueva revisión: otra sesión pudo unirlas o abrirles atención.
    await c.query("SELECT id_paciente FROM pacientes WHERE id_paciente IN ($1, $2) ORDER BY id_paciente FOR UPDATE", [idPrincipal, idUnido]);
    const principal = await obtenerPaciente(c, idPrincipal);
    const unido = await obtenerPaciente(c, idUnido);
    if (principal.id_paciente_principal || unido.id_paciente_principal) throw new ErrorApi(409, "PACIENTE_UNIDO", "Uno de los registros ya fue unido a otro.");
    if (principal.atencion_abierta && unido.atencion_abierta) {
      throw new ErrorApi(409, "ATENCION_ABIERTA_EN_AMBOS", "Los dos registros tienen una atención abierta. Cierre una antes de unirlos.");
    }
    const copia = (await c.query("SELECT to_jsonb(p) AS d FROM pacientes p WHERE id_paciente = $1", [idUnido])).rows[0].d;
    await c.query("INSERT INTO uniones_pacientes (id_paciente, id_paciente_unido, motivo, datos_unido, id_usuario) VALUES ($1, $2, $3, $4, $5)",
      [idPrincipal, idUnido, motivo, JSON.stringify(copia), actor.idUsuario]);
    await c.query("UPDATE atenciones SET id_paciente = $1 WHERE id_paciente = $2", [idPrincipal, idUnido]);
    await c.query("UPDATE proximos_controles SET id_paciente = $1 WHERE id_paciente = $2", [idPrincipal, idUnido]);
    await c.query(
      `INSERT INTO pacientes_encargados (id_paciente, id_encargado, parentesco, es_principal)
       SELECT $1, id_encargado, parentesco, false FROM pacientes_encargados WHERE id_paciente = $2 ON CONFLICT DO NOTHING`, [idPrincipal, idUnido]);
    // Lo que le falta al registro conservado se completa con el absorbido (el CUI se traslada para no duplicarlo)
    // El CUI del absorbido siempre se libera (queda en la copia de la unión): así no bloquea registrar después a quien lo tenga.
    if (unido.cui) {
      await c.query("UPDATE pacientes SET cui = NULL WHERE id_paciente = $1", [idUnido]);
      if (!principal.cui) await c.query("UPDATE pacientes SET cui = $2 WHERE id_paciente = $1", [idPrincipal, unido.cui]);
    }
    await c.query("UPDATE pacientes SET telefono = COALESCE(telefono, $2), direccion = COALESCE(direccion, $3) WHERE id_paciente = $1", [idPrincipal, unido.telefono, unido.direccion]);
    await c.query("UPDATE pacientes SET id_paciente_principal = $1 WHERE id_paciente = $2", [idPrincipal, idUnido]);
    await registrarEventoEn(c, { accion: "unir", entidad: "pacientes", idRegistro: idPrincipal, idUsuario: actor.idUsuario, direccionIp: actor.ip,
      detalle: `Unió ${unido.codigo_paciente} en ${principal.codigo_paciente}. Motivo: ${motivo}`.slice(0, 300) });
  });
  return obtenerPaciente(pool, idPrincipal);
}
