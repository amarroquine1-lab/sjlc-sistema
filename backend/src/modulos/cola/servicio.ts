import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { registrarEvento, registrarEventoEn } from "../../bitacora/servicio.js";
import { ErrorApi } from "../../comun/errores.js";
import { calcularEdad } from "../../servicios/calculos.js";
import { obtenerPaciente, type Actor } from "../pacientes/servicio.js";
import { datosClinicos } from "../consulta/servicio.js";
import { datosFarmacia, haySinEntregar } from "../farmacia/servicio.js";
import { evaluacionVigente } from "../nutricion/servicio.js";
import { datosVacunacion } from "../vacunacion/servicio.js";
import { signosVigentes } from "../signos/servicio.js";

// Áreas con cola. La clave va en la URL; el nombre es el de la tabla areas.
export const AREAS = {
  signos: "signos vitales", doctor: "doctor", nutricion: "nutrición", vacunacion: "vacunación", farmacia: "farmacia",
} as const;
export type ClaveArea = keyof typeof AREAS;
export const CLAVES_AREA = Object.keys(AREAS) as ClaveArea[];
export const claveDeArea = (nombre: string | null): ClaveArea | null => (CLAVES_AREA.find((k) => AREAS[k] === nombre) ?? null);

export interface UsuarioActor extends Actor { rol: string; area: string | null }

// Destinos válidos al terminar en un área (rutas sugeridas, no rígidas: sección 10.2 de la especificación).
const DESTINOS: Record<ClaveArea, (ClaveArea | "finalizar")[]> = {
  signos: ["doctor", "nutricion", "vacunacion"],
  // Doctor, nutrición y vacunación se envían pacientes entre sí; las tres pueden ir a farmacia o finalizar.
  doctor: ["nutricion", "vacunacion", "farmacia", "finalizar"],
  nutricion: ["doctor", "vacunacion", "farmacia", "finalizar"],
  vacunacion: ["doctor", "nutricion", "farmacia", "finalizar"],
  farmacia: ["finalizar"],
};
const SUGERIDO_POR_TIPO: Record<string, ClaveArea> = {
  "consulta general": "doctor", "vacunación": "vacunacion", "nutrición directa": "nutricion", "planificación familiar": "doctor", "emergencia": "doctor",
};

export async function tieneReceta(c: pg.Pool | pg.PoolClient, idAtencion: number): Promise<boolean> {
  const r = await c.query("SELECT 1 FROM recetas rc JOIN recetas_detalle d USING (id_receta) WHERE rc.id_atencion = $1 AND rc.vigente LIMIT 1", [idAtencion]);
  return Boolean(r.rowCount);
}

// Con receta sin entregar, farmacia es el paso final obligatorio: fuera de farmacia no se ofrece "Finalizar".
// Las tres áreas clínicas siempre ven Farmacia; si aún no hay receta, la opción lo avisa (requiere_receta) y la pantalla pide guardarla primero.
export async function opcionesEnvio(c: pg.Pool | pg.PoolClient, area: ClaveArea, tipo: string, idAtencion: number) {
  const receta = await tieneReceta(c, idAtencion);
  const pendiente = area !== "farmacia" && (await haySinEntregar(c, idAtencion));
  const validas = DESTINOS[area].filter((d) => !(d === "finalizar" && pendiente));
  const sugerido = area === "signos" ? SUGERIDO_POR_TIPO[tipo] : area !== "farmacia" && pendiente ? "farmacia" : undefined;
  return validas.map((d) => ({
    destino: d, etiqueta: d === "finalizar" ? "Finalizar" : AREAS[d], sugerido: d === sugerido, requiere_receta: d === "farmacia" && !receta,
  }));
}

const FILAS = `SELECT r.id_recorrido_atencion, r.id_atencion, r.fecha_hora_inicio IS NOT NULL AS en_atencion, r.id_usuario,
    (u.nombres || ' ' || u.apellidos) AS atiende, a.numero_atencion, a.estado, ta.nombre_tipo_atencion AS tipo, ta.es_emergencia,
    p.id_paciente, p.codigo_paciente, p.nombres, p.apellidos, p.sexo, to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
    p.edad_aproximada_anios, p.datos_incompletos, to_char(current_date, 'YYYY-MM-DD') AS hoy,
    floor(extract(epoch FROM (now() - r.fecha_hora_entrada)) / 60)::int AS espera_minutos,
    to_char(r.fecha_hora_entrada, 'HH24:MI') AS entrada_hora, to_char(r.fecha_hora_inicio, 'HH24:MI') AS inicio_hora, r.motivo_envio,
    (SELECT count(*) FROM proximos_controles pc WHERE pc.id_paciente = p.id_paciente AND pc.estado = 'pendiente')::int AS pendientes
  FROM recorridos_atencion r
  JOIN atenciones a ON a.id_atencion = r.id_atencion
  JOIN tipos_atencion ta ON ta.id_tipo_atencion = a.id_tipo_atencion
  JOIN pacientes p ON p.id_paciente = a.id_paciente
  LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario`;

function fila(f: any) {
  const edad = f.fecha_nacimiento ? calcularEdad(f.fecha_nacimiento, f.hoy).texto : f.edad_aproximada_anios !== null ? `unos ${f.edad_aproximada_anios} años` : null;
  const { hoy: _h, fecha_nacimiento: _f, edad_aproximada_anios: _e, ...resto } = f;
  return { ...resto, edad };
}

// La atención que esta persona tiene en curso. Administración puede tener una por área (se busca en el área indicada);
// los roles operativos, una sola en cualquier área. Es el mismo criterio de la base de datos, así la validación de
// "llamar" y lo que muestran las pantallas nunca se contradicen.
interface EnCurso { numero_atencion: string; nombre_area: string; paciente: string }
async function atencionEnCurso(c: pg.Pool | pg.PoolClient, idUsuario: number, nombreArea: string | null = null): Promise<EnCurso | null> {
  const r = await c.query(
    `SELECT a.numero_atencion, ar.nombre_area,
            CASE WHEN p.nombres IS NULL THEN 'un paciente sin identificar'
                 ELSE split_part(p.nombres, ' ', 1) || coalesce(' ' || nullif(left(p.apellidos, 1), '') || '.', '') END AS paciente
       FROM recorridos_atencion r JOIN atenciones a USING (id_atencion) JOIN pacientes p USING (id_paciente) JOIN areas ar USING (id_area)
      WHERE r.id_usuario = $1 AND r.fecha_hora_inicio IS NOT NULL AND r.fecha_hora_salida IS NULL AND ($2::text IS NULL OR ar.nombre_area = $2) LIMIT 1`, [idUsuario, nombreArea]);
  return r.rows[0] ?? null;
}
const nombreDeArea = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
export function mensajeYaAtiende(e: EnCurso): string {
  return `Ya tiene a ${e.paciente} (${e.numero_atencion}) en atención en ${nombreDeArea(e.nombre_area)}. Termine con él antes de llamar a otro.`;
}

export async function verCola(pool: pg.Pool, clave: ClaveArea, idUsuario: number, rol = "") {
  const r = await pool.query(
    `${FILAS} WHERE r.id_area = (SELECT id_area FROM areas WHERE nombre_area = $1) AND r.fecha_hora_salida IS NULL AND a.estado IN ('en_espera', 'enviado', 'en_atencion')
      ORDER BY (r.fecha_hora_inicio IS NOT NULL), ta.es_emergencia DESC, r.fecha_hora_entrada, r.id_recorrido_atencion`, [AREAS[clave]]);
  // Farmacia recibe datos mínimos: el motivo de envío (texto libre del área anterior) no se le muestra
  const filas = r.rows.map(fila).map((f) => (clave === "farmacia" ? { ...f, motivo_envio: null } : f));
  const mia = filas.find((f) => f.en_atencion && f.id_usuario === idUsuario) ?? null;
  // Si la persona tiene a alguien en atención en OTRA área, la pantalla lo dice (y a dónde ir) en lugar de mostrar "nadie".
  let otra: { numero_atencion: string; area: string; clave: ClaveArea | null; paciente: string } | null = null;
  if (!mia && rol !== "administrador") {
    const e = await atencionEnCurso(pool, idUsuario);
    if (e) otra = { numero_atencion: e.numero_atencion, area: nombreDeArea(e.nombre_area), clave: claveDeArea(e.nombre_area), paciente: e.paciente };
  }
  return {
    area: AREAS[clave], clave,
    en_espera: filas.filter((f) => !f.en_atencion),
    en_atencion: filas.filter((f) => f.en_atencion),
    mi_atencion: mia,
    mi_atencion_otra_area: otra,
  };
}

// "Llamar siguiente": asignación atómica. FOR UPDATE SKIP LOCKED garantiza que dos personas nunca toman a la misma;
// el índice único (usuario, área) y el disparador de roles operativos garantizan que una persona no atiende a dos a la vez.
// Con idAtencion se toma a ese paciente de la lista ("Atender"); sin él, al siguiente según el orden. En ambos casos es atómico.
export async function llamarSiguiente(pool: pg.Pool, actor: UsuarioActor, clave: ClaveArea, idAtencion: number | null = null) {
  try {
    const id = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
      // Las llamadas de una misma persona se hacen una por una: un doble clic no aparta pacientes de la cola.
      const turno = await c.query("SELECT pg_try_advisory_xact_lock(7340100, $1) AS ok", [actor.idUsuario]);
      if (!turno.rows[0].ok) throw new ErrorApi(409, "LLAMADA_EN_CURSO", "Ya hay una llamada en curso. Espere un momento.");
      const yaAtiende = await atencionEnCurso(c, actor.idUsuario, actor.rol === "administrador" ? AREAS[clave] : null);
      if (yaAtiende) throw new ErrorApi(409, "YA_ATIENDE", mensajeYaAtiende(yaAtiende),
        { numero_atencion: yaAtiende.numero_atencion, area: nombreDeArea(yaAtiende.nombre_area), clave: claveDeArea(yaAtiende.nombre_area), paciente: yaAtiende.paciente });
      // Se bloquea primero la atención (SKIP LOCKED: dos personas nunca toman a la misma) y después su tramo.
      const cand = await c.query(
        `SELECT a.id_atencion FROM atenciones a JOIN tipos_atencion ta ON ta.id_tipo_atencion = a.id_tipo_atencion
           JOIN recorridos_atencion r ON r.id_atencion = a.id_atencion
          WHERE r.id_area = (SELECT id_area FROM areas WHERE nombre_area = $1) AND r.fecha_hora_inicio IS NULL AND r.fecha_hora_salida IS NULL
            AND a.estado IN ('en_espera', 'enviado') AND ($2::int IS NULL OR a.id_atencion = $2)
          ORDER BY ta.es_emergencia DESC, r.fecha_hora_entrada, r.id_recorrido_atencion
          FOR UPDATE OF a SKIP LOCKED LIMIT 1`, [AREAS[clave], idAtencion]);
      if (!cand.rows[0] && idAtencion !== null) {
        const quien = await c.query(
          `SELECT r.id_usuario, (u.nombres || ' ' || u.apellidos) AS atiende FROM recorridos_atencion r LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
            WHERE r.id_atencion = $1 AND r.fecha_hora_salida IS NULL AND r.id_area = (SELECT id_area FROM areas WHERE nombre_area = $2)`, [idAtencion, AREAS[clave]]);
        if (quien.rows[0]?.atiende) throw new ErrorApi(409, "YA_TOMADA", `Ese paciente ya lo está atendiendo ${quien.rows[0].atiende}.`);
        if (quien.rowCount) throw new ErrorApi(409, "YA_TOMADA", "Otra persona está tomando a ese paciente en este momento. Actualice la lista.");
        throw new ErrorApi(404, "NO_ESTA_EN_COLA", "Ese paciente ya no está en la cola de esta área. Actualice la lista.");
      }
      if (!cand.rows[0]) return null;
      const s = await c.query(
        `UPDATE recorridos_atencion SET fecha_hora_inicio = now(), id_usuario = $3
          WHERE id_atencion = $2 AND id_area = (SELECT id_area FROM areas WHERE nombre_area = $1) AND fecha_hora_inicio IS NULL AND fecha_hora_salida IS NULL
          RETURNING id_atencion`, [AREAS[clave], cand.rows[0].id_atencion, actor.idUsuario]);
      if (!s.rows[0]) return null;
      if (idAtencion !== null) {
        // Tomar a alguien de la lista puede saltarse el orden (emergencias primero, luego por llegada): queda dicho en la bitácora.
        const antes = await c.query(
          `SELECT count(*)::int AS delante, count(*) FILTER (WHERE ta.es_emergencia)::int AS emergencias
             FROM recorridos_atencion r JOIN atenciones a USING (id_atencion) JOIN tipos_atencion ta USING (id_tipo_atencion)
            WHERE r.id_area = (SELECT id_area FROM areas WHERE nombre_area = $1) AND r.fecha_hora_inicio IS NULL AND r.fecha_hora_salida IS NULL AND a.estado IN ('en_espera', 'enviado')`, [AREAS[clave]]);
        await registrarEventoEn(c, { accion: "atender_directo", entidad: "atenciones", idRegistro: idAtencion, idUsuario: actor.idUsuario, direccionIp: actor.ip,
          detalle: `área ${AREAS[clave]}; quedaron esperando ${antes.rows[0].delante} (${antes.rows[0].emergencias} emergencia(s))` });
      }
      await c.query("UPDATE atenciones SET estado = 'en_atencion' WHERE id_atencion = $1", [s.rows[0].id_atencion]);
      return s.rows[0].id_atencion as number;
    });
    if (id === null) throw new ErrorApi(404, "COLA_VACIA", "No hay pacientes esperando en esta área.");
    return panelAtencion(pool, actor, id);
  } catch (error) {
    if (["ux_recorridos_usuario_area_en_atencion", "ux_recorridos_operativo_un_paciente"].includes((error as { constraint?: string }).constraint ?? "")) {
      const e = await atencionEnCurso(pool, actor.idUsuario, actor.rol === "administrador" ? AREAS[clave] : null);
      throw new ErrorApi(409, "YA_ATIENDE", e ? mensajeYaAtiende(e) : "Ya tiene un paciente en atención. Termine con él antes de llamar a otro.");
    }
    throw error;
  }
}

// Tramo abierto de la atención y verificación de que quien actúa es quien la atiende (el administrador puede en cualquier caso).
async function tramoActual(c: pg.Pool | pg.PoolClient, actor: UsuarioActor, idAtencion: number, bloquear = false) {
  // Orden de bloqueo común a toda la cola: primero la atención y después su tramo (evita interbloqueos con el cierre del día).
  if (bloquear) await c.query("SELECT 1 FROM atenciones WHERE id_atencion = $1 FOR UPDATE", [idAtencion]);
  const r = await c.query(
    `SELECT r.id_recorrido_atencion, r.id_usuario, r.fecha_hora_inicio, r.fecha_hora_inicio IS NOT NULL AS en_atencion, ar.nombre_area, a.estado, ta.nombre_tipo_atencion AS tipo, r.motivo_envio
       FROM recorridos_atencion r JOIN areas ar ON ar.id_area = r.id_area JOIN atenciones a ON a.id_atencion = r.id_atencion JOIN tipos_atencion ta ON ta.id_tipo_atencion = a.id_tipo_atencion
      WHERE r.id_atencion = $1 AND r.fecha_hora_salida IS NULL ${bloquear ? "FOR UPDATE OF r" : ""}`, [idAtencion]);
  const t = r.rows[0];
  if (!t) throw new ErrorApi(409, "ATENCION_SIN_AREA", "La atención no está en ninguna área (ya terminó o se cerró).");
  if (actor.rol !== "administrador") {
    if (t.nombre_area !== actor.area) throw new ErrorApi(403, "OTRA_AREA", "Esta atención está en otra área.");
    if (!t.en_atencion || t.id_usuario !== actor.idUsuario) throw new ErrorApi(403, "NO_LA_ATIENDE", "Solo quien está atendiendo al paciente puede hacer esto. Llame al paciente primero.");
  }
  return t;
}
export { tramoActual };

// Datos mínimos del paciente para farmacia: identificación sin domicilio, teléfono, pueblo ni encargados.
function reducirPaciente<T extends Record<string, unknown>>(p: T): T {
  return { ...p, telefono: null, direccion: null, id_municipio_residencia: null, municipio_residencia: null, zona_residencia: null, id_colonia_sector: null,
    colonia_sector: null, id_pueblo: null, id_comunidad_linguistica: null, numero_registro_libro: null, encargados: [], pendientes: [] };
}

export async function panelAtencion(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, registrarAcceso = true) {
  const t = await tramoActual(pool, actor, idAtencion);
  const a = await pool.query("SELECT id_paciente, numero_atencion, estado, (SELECT es_emergencia FROM tipos_atencion x WHERE x.id_tipo_atencion = a.id_tipo_atencion) AS es_emergencia FROM atenciones a WHERE id_atencion = $1", [idAtencion]);
  const clave = claveDeArea(t.nombre_area);
  const clinico = clave === "doctor" || clave === "nutricion" ? await datosClinicos(pool, idAtencion, clave) : null;
  const especifico = clave === "nutricion" ? { evaluacion: await evaluacionVigente(pool, idAtencion) } : clave === "vacunacion" ? await datosVacunacion(pool, idAtencion) : clave === "farmacia" ? await datosFarmacia(pool, idAtencion) : null;
  const vioHistorialVacunas = clave === "vacunacion" && (especifico as { esquema_previo?: unknown[] } | null)?.esquema_previo?.length;
  // Sección 10.7: el acceso al historial queda en bitácora (una vez por llamada al paciente, no por cada recarga).
  if (registrarAcceso && ((clinico && clinico.historial_resumido.length > 0) || vioHistorialVacunas)) {
    await registrarEvento(pool, { accion: "ver_historial", entidad: "pacientes", idRegistro: a.rows[0].id_paciente, idUsuario: actor.idUsuario, direccionIp: actor.ip, detalle: `panel de ${clave}, atención ${a.rows[0].numero_atencion}` });
  }
  return {
    atencion: { id_atencion: idAtencion, numero_atencion: a.rows[0].numero_atencion, estado: a.rows[0].estado, tipo: t.tipo, es_emergencia: a.rows[0].es_emergencia, area: t.nombre_area, motivo_envio: clave === "farmacia" ? null : t.motivo_envio ?? null },
    paciente: clave === "farmacia" ? reducirPaciente(await obtenerPaciente(pool, a.rows[0].id_paciente)) : await obtenerPaciente(pool, a.rows[0].id_paciente),
    // Farmacia no necesita signos vitales: no se envían (ocultarlos en pantalla no basta).
    signos: clave === "farmacia" ? null : await signosVigentes(pool, idAtencion, a.rows[0].id_paciente),
    clinico,
    especifico,
    opciones_envio: clave ? await opcionesEnvio(pool, clave, t.tipo, idAtencion) : [],
  };
}

export async function enviar(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, destino: ClaveArea | "finalizar", motivo?: string | null) {
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    const clave = claveDeArea(t.nombre_area);
    if (!clave) throw new ErrorApi(409, "AREA_SIN_COLA", "Esta área no maneja cola.");
    // Registrar lo propio del área (consulta, evaluación o vacuna) se exige solo para finalizar; enviar a otra área se permite sin registro.
    const cierra = destino === "finalizar";
    if (cierra && clave === "doctor" && actor.rol === "doctor") {
      const hay = await c.query("SELECT 1 FROM consultas WHERE id_atencion = $1 AND vigente", [idAtencion]);
      if (!hay.rowCount) throw new ErrorApi(409, "CONSULTA_FALTANTE", "Registre la consulta (motivo y diagnóstico) antes de finalizar.");
    }
    if (cierra && clave === "farmacia" && actor.rol === "farmacia" && (await haySinEntregar(c, idAtencion))) {
      throw new ErrorApi(409, "ENTREGA_PENDIENTE", "Registre la entrega de los medicamentos antes de finalizar.");
    }
    if (cierra && clave === "nutricion" && actor.rol === "nutricion" && !(await c.query("SELECT 1 FROM evaluaciones_nutricionales WHERE id_atencion = $1 AND vigente", [idAtencion])).rowCount) {
      throw new ErrorApi(409, "EVALUACION_FALTANTE", "Registre la evaluación nutricional antes de finalizar.");
    }
    if (cierra && clave === "vacunacion" && actor.rol === "vacunacion" && !(await c.query("SELECT 1 FROM vacunas_aplicadas WHERE id_atencion = $1 AND vigente", [idAtencion])).rowCount) {
      throw new ErrorApi(409, "VACUNA_FALTANTE", "Registre al menos una vacuna aplicada antes de finalizar. Si el paciente no fue vacunado, pida a un administrador que finalice la atención.");
    }
    if (destino === "finalizar" && clave !== "farmacia" && (await haySinEntregar(c, idAtencion))) {
      throw new ErrorApi(409, "RECETA_PENDIENTE", "La atención tiene una receta sin entregar. Envíela a Farmacia para cerrarla.");
    }
    if (destino === "farmacia" && DESTINOS[clave].includes("farmacia") && !(await tieneReceta(c, idAtencion))) {
      throw new ErrorApi(409, "RECETA_FALTANTE", "Primero agregue y guarde la receta; Farmacia solo recibe pacientes con receta.");
    }
    const validas = await opcionesEnvio(c, clave, t.tipo, idAtencion);
    if (!validas.some((o) => o.destino === destino)) {
      throw new ErrorApi(422, "DESTINO_NO_VALIDO", destino === "farmacia" ? "Farmacia solo recibe pacientes con receta." : "Ese destino no es válido desde esta área.");
    }
    await c.query("UPDATE recorridos_atencion SET fecha_hora_salida = now() WHERE id_recorrido_atencion = $1", [t.id_recorrido_atencion]);
    if (destino === "finalizar") {
      await c.query("UPDATE atenciones SET estado = 'finalizada', fecha_hora_cierre = now() WHERE id_atencion = $1", [idAtencion]);
    } else {
      await c.query("INSERT INTO recorridos_atencion (id_atencion, id_area, motivo_envio) SELECT $1, id_area, $3 FROM areas WHERE nombre_area = $2", [idAtencion, AREAS[destino], motivo?.trim() || null]);
      await c.query("UPDATE atenciones SET estado = 'enviado' WHERE id_atencion = $1", [idAtencion]);
    }
  });
  const e = await pool.query("SELECT numero_atencion, estado FROM atenciones WHERE id_atencion = $1", [idAtencion]);
  return { id_atencion: idAtencion, numero_atencion: e.rows[0].numero_atencion, estado: e.rows[0].estado, destino };
}

// "Devolver a la cola": quien llamó al paciente equivocado lo regresa a la cola de la misma área, con su hora de llegada original.
// Se reabre el mismo tramo (sin inicio ni usuario), así no cuenta como atención ni altera los tiempos. Si en ese tramo ya se guardó
// algún dato clínico, no se permite: lo guardado no se borra.
export async function devolverALaCola(pool: pg.Pool, actor: UsuarioActor, idAtencion: number) {
  return conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    if (!t.en_atencion) throw new ErrorApi(409, "NO_EN_ATENCION", "Este paciente no está en atención; no hay nada que devolver.");
    const guardado = await c.query(
      `SELECT (SELECT count(*) FROM signos_vitales WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM consultas WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM recetas WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM evaluaciones_nutricionales WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM vacunas_aplicadas WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM proximos_controles WHERE id_atencion = $1 AND fecha_creacion >= $2)
            + (SELECT count(*) FROM entregas_farmacia e JOIN recetas rc USING (id_receta) WHERE rc.id_atencion = $1 AND e.fecha_hora >= $2) AS total`,
      [idAtencion, t.fecha_hora_inicio]);
    if (Number(guardado.rows[0].total) > 0) {
      throw new ErrorApi(409, "YA_HAY_DATOS", "No se puede devolver a la cola: ya se guardaron datos de este paciente en esta área. Termine la atención y envíelo a donde corresponda.");
    }
    await c.query("UPDATE recorridos_atencion SET fecha_hora_inicio = NULL, id_usuario = NULL WHERE id_recorrido_atencion = $1", [t.id_recorrido_atencion]);
    await c.query("UPDATE atenciones SET estado = 'en_espera' WHERE id_atencion = $1", [idAtencion]);
    const antes = await c.query("SELECT nombres || ' ' || apellidos AS nombre FROM usuarios WHERE id_usuario = $1", [t.id_usuario]);
    await registrarEventoEn(c, { accion: "devolver_a_cola", entidad: "atenciones", idRegistro: idAtencion, idUsuario: actor.idUsuario, direccionIp: actor.ip,
      detalle: `área ${t.nombre_area}; lo atendía ${antes.rows[0]?.nombre ?? "—"} (usuario ${t.id_usuario})${t.id_usuario === actor.idUsuario ? "" : "; lo devolvió otra persona"}` });
    const e = await c.query("SELECT numero_atencion FROM atenciones WHERE id_atencion = $1", [idAtencion]);
    return { id_atencion: idAtencion, numero_atencion: e.rows[0].numero_atencion as string, area: t.nombre_area as string };
  });
}

// "Tomar atención": Administración toma al paciente que otra persona está atendiendo en un área (por ejemplo, si quien lo llamó
// ya no está). Se reasigna el mismo tramo —conserva la hora de inicio—, respetando un paciente por área.
export async function tomarAtencion(pool: pg.Pool, actor: UsuarioActor, idAtencion: number) {
  if (actor.rol !== "administrador") throw new ErrorApi(403, "SIN_PERMISO", "Solo Administración puede tomar la atención de otra persona.");
  try {
    return await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
      const t = await tramoActual(c, actor, idAtencion, true);
      if (!t.en_atencion) throw new ErrorApi(409, "NO_EN_ATENCION", "Ese paciente no está en atención; llámelo desde la cola.");
      if (t.id_usuario === actor.idUsuario) throw new ErrorApi(409, "YA_ES_SUYA", "Ese paciente ya lo está atendiendo usted.");
      const yaAtiende = await atencionEnCurso(c, actor.idUsuario, t.nombre_area);
      if (yaAtiende) throw new ErrorApi(409, "YA_ATIENDE", mensajeYaAtiende(yaAtiende));
      const antes = await c.query("SELECT nombres || ' ' || apellidos AS nombre FROM usuarios WHERE id_usuario = $1", [t.id_usuario]);
      await c.query("UPDATE recorridos_atencion SET id_usuario = $2 WHERE id_recorrido_atencion = $1", [t.id_recorrido_atencion, actor.idUsuario]);
      await registrarEventoEn(c, { accion: "tomar_atencion", entidad: "atenciones", idRegistro: idAtencion, idUsuario: actor.idUsuario, direccionIp: actor.ip,
        detalle: `área ${t.nombre_area}; la atendía ${antes.rows[0]?.nombre ?? "—"} (usuario ${t.id_usuario})` });
      return { id_atencion: idAtencion, area: t.nombre_area as string };
    }).then(async (r) => ({ ...r, ...(await panelAtencion(pool, actor, idAtencion)) }));
  } catch (error) {
    if (["ux_recorridos_usuario_area_en_atencion", "ux_recorridos_operativo_un_paciente"].includes((error as { constraint?: string }).constraint ?? "")) {
      throw new ErrorApi(409, "YA_ATIENDE", "Ya tiene un paciente en atención en esta área. Termine con él antes de tomar a otro.");
    }
    throw error;
  }
}

// Cierre del día: toda atención abierta pasa a "no concluida". Lo ejecuta el sistema (usuario "sistema") o un administrador.
export async function cerrarDia(pool: pg.Pool, idUsuarioActor: number, ip: string | null, soloDiasAnteriores = false): Promise<{ cerradas: number; en_curso?: boolean }> {
  const cliente = await pool.connect();
  try {
    const bloqueo = await cliente.query("SELECT pg_try_advisory_lock(7340002) AS ok");
    if (!bloqueo.rows[0].ok) return { cerradas: 0, en_curso: true };
    try {
      return await conTransaccion(pool, { idUsuario: idUsuarioActor, direccionIp: ip }, async (c) => {
        // Se bloquean las atenciones abiertas y se cierran esas mismas; el trigger de la base cierra además sus tramos.
        const abiertas = await c.query("SELECT id_atencion FROM atenciones WHERE estado IN ('en_espera', 'en_atencion', 'enviado') AND ($1::boolean IS FALSE OR fecha_hora_llegada::date < current_date) ORDER BY id_atencion FOR UPDATE", [soloDiasAnteriores]);
        const ids = abiertas.rows.map((x) => x.id_atencion as number);
        if (ids.length > 0) {
          await c.query("UPDATE recorridos_atencion SET fecha_hora_salida = GREATEST(now(), fecha_hora_entrada, coalesce(fecha_hora_inicio, fecha_hora_entrada)) WHERE id_atencion = ANY($1::int[]) AND fecha_hora_salida IS NULL", [ids]);
          await c.query("UPDATE atenciones SET estado = 'no_concluida', fecha_hora_cierre = now() WHERE id_atencion = ANY($1::int[])", [ids]);
        }
        await registrarEventoEn(c, { accion: "cierre_dia", entidad: "atenciones", idUsuario: idUsuarioActor, direccionIp: ip, detalle: `${ids.length} atención(es) pasaron a no concluida` });
        return { cerradas: ids.length };
      });
    } finally {
      await cliente.query("SELECT pg_advisory_unlock(7340002)");
    }
  } finally {
    cliente.release();
  }
}

// Programa el cierre diario a la hora indicada ("HH:MM", hora de Guatemala). Revisa cada minuto; no se repite el mismo día.
export function programarCierreDiario(pool: pg.Pool, hora: string, registrar: (m: string) => void): NodeJS.Timeout {
  let ultimoDia = "";
  return setInterval(async () => {
    try {
      const r = await pool.query("SELECT to_char(now(), 'HH24:MI') AS ahora, to_char(current_date, 'YYYY-MM-DD') AS hoy");
      // Si el sistema estuvo apagado a la hora del cierre, al volver se cierran las atenciones de días anteriores.
      const rezagadas = await pool.query("SELECT 1 FROM atenciones WHERE estado IN ('en_espera', 'en_atencion', 'enviado') AND fecha_hora_llegada::date < current_date LIMIT 1");
      if (r.rows[0].ahora < hora && rezagadas.rowCount) {
        const s = await pool.query("SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'sistema'");
        if (s.rows[0]) { const res = await cerrarDia(pool, s.rows[0].id_usuario, null, true); registrar(`Cierre de días anteriores: ${res.cerradas} atención(es) pasaron a no concluida.`); }
        return;
      }
      if (r.rows[0].ahora < hora || ultimoDia === r.rows[0].hoy) return;
      const sistema = await pool.query("SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'sistema'");
      if (!sistema.rows[0]) { registrar("No se pudo ejecutar el cierre del día: falta el usuario sistema (ejecute el seed de producción)."); ultimoDia = r.rows[0].hoy; return; }
      ultimoDia = r.rows[0].hoy;
      const res = await cerrarDia(pool, sistema.rows[0].id_usuario, null);
      registrar(`Cierre del día: ${res.cerradas} atención(es) pasaron a no concluida.`);
    } catch (error) {
      registrar(`No se pudo ejecutar el cierre del día: ${(error as Error).message}`);
    }
  }, 60_000);
}
