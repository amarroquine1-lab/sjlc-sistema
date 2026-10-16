import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import { tramoActual, type UsuarioActor } from "../cola/servicio.js";

export interface LineaEntrega { id_receta_detalle: number; cantidad_entregada: number; observacion?: string | null }

// Renglones de las recetas vigentes de la atención (doctor y nutrición) con lo ya entregado, si hay.
export async function datosFarmacia(c: pg.Pool | pg.PoolClient, idAtencion: number) {
  const r = await c.query(
    `SELECT d.id_receta_detalle, r.id_receta, ar.nombre_area AS receta_de, (ur.nombres || ' ' || ur.apellidos) AS responsable_consulta,
            d.medicamento_texto AS medicamento, d.presentacion_texto AS presentacion, d.cantidad_recetada, d.indicaciones,
            e.numero_orden, ed.cantidad_entregada, ed.cantidad_no_entregada, ed.observacion, e.recibido_por,
            to_char(e.fecha_hora, 'DD/MM/YYYY HH24:MI') AS entregada_el
       FROM recetas r JOIN areas ar USING (id_area) JOIN usuarios ur ON ur.id_usuario = r.id_usuario
       JOIN recetas_detalle d USING (id_receta)
       LEFT JOIN entregas_farmacia e ON e.id_receta = r.id_receta
       LEFT JOIN entregas_farmacia_detalle ed ON ed.id_receta_detalle = d.id_receta_detalle
      WHERE r.id_atencion = $1 AND r.vigente ORDER BY r.id_receta, d.id_receta_detalle`, [idAtencion]);
  return { renglones: r.rows, pendiente: r.rows.some((x) => x.numero_orden === null) };
}

export async function haySinEntregar(c: pg.Pool | pg.PoolClient, idAtencion: number): Promise<boolean> {
  const r = await c.query(
    "SELECT 1 FROM recetas r JOIN recetas_detalle USING (id_receta) WHERE r.id_atencion = $1 AND r.vigente AND NOT EXISTS (SELECT 1 FROM entregas_farmacia e WHERE e.id_receta = r.id_receta) LIMIT 1", [idAtencion]);
  return Boolean(r.rowCount);
}

// Entrega de todas las recetas pendientes de la atención, renglón por renglón (una entrega por receta).
export async function registrarEntrega(pool: pg.Pool, actor: UsuarioActor, idAtencion: number, d: { recibido_por?: string | null; lineas: LineaEntrega[] }, finalizar = false) {
  await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
    const t = await tramoActual(c, actor, idAtencion, true);
    if (t.nombre_area !== "farmacia") throw new ErrorApi(403, "OTRA_AREA", "Las entregas se registran en farmacia.");
    const pend = await c.query(
      `SELECT d.id_receta_detalle, d.id_receta, d.cantidad_recetada FROM recetas r JOIN recetas_detalle d USING (id_receta)
        WHERE r.id_atencion = $1 AND r.vigente AND NOT EXISTS (SELECT 1 FROM entregas_farmacia e WHERE e.id_receta = r.id_receta) ORDER BY d.id_receta, d.id_receta_detalle`, [idAtencion]);
    if (!pend.rowCount) throw new ErrorApi(409, "SIN_PENDIENTES", "No hay recetas pendientes de entrega en esta atención.");
    const ids = d.lineas.map((l) => l.id_receta_detalle);
    if (new Set(ids).size !== ids.length) throw new ErrorApi(422, "RENGLON_REPETIDO", "Un renglón aparece dos veces.");
    if (ids.length !== pend.rowCount || !pend.rows.every((x) => ids.includes(x.id_receta_detalle))) {
      throw new ErrorApi(422, "RENGLONES_INCOMPLETOS", "Debe indicar la cantidad entregada de todos los renglones pendientes de la receta.");
    }
    // Todo se valida antes del primer INSERT: un rechazo no debe consumir números de orden.
    const falta: Record<number, number> = {};
    for (const x of pend.rows) {
      const l = d.lineas.find((y) => y.id_receta_detalle === x.id_receta_detalle)!;
      if (l.cantidad_entregada > x.cantidad_recetada) throw new ErrorApi(422, "CANTIDAD_EXCEDIDA", "No se puede entregar más de lo recetado.");
      falta[x.id_receta_detalle] = x.cantidad_recetada - l.cantidad_entregada;
      if (falta[x.id_receta_detalle] > 0 && !l.observacion?.trim()) throw new ErrorApi(422, "OBSERVACION_REQUERIDA", "Si no se entrega todo, escriba el motivo en la observación.");
    }
    const recetas = [...new Set(pend.rows.map((x) => x.id_receta as number))];
    const entrega: Record<number, number> = {};
    for (const idReceta of recetas) {
      const e = await c.query("INSERT INTO entregas_farmacia (id_receta, recibido_por, id_usuario) VALUES ($1, $2, $3) RETURNING id_entrega_farmacia", [idReceta, d.recibido_por ?? null, actor.idUsuario]);
      entrega[idReceta] = e.rows[0].id_entrega_farmacia;
    }
    for (const x of pend.rows) {
      const l = d.lineas.find((y) => y.id_receta_detalle === x.id_receta_detalle)!;
      await c.query(
        "INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia, id_receta_detalle, cantidad_entregada, cantidad_no_entregada, observacion) VALUES ($1, $2, $3, $4, $5)",
        [entrega[x.id_receta], x.id_receta_detalle, l.cantidad_entregada, falta[x.id_receta_detalle], l.observacion?.trim() || null]);
    }
    // Entregar y finalizar en un solo paso: cierra el tramo de farmacia y la atención en la misma transacción.
    if (finalizar) {
      await c.query("UPDATE recorridos_atencion SET fecha_hora_salida = now() WHERE id_recorrido_atencion = $1", [t.id_recorrido_atencion]);
      await c.query("UPDATE atenciones SET estado = 'finalizada', fecha_hora_cierre = now() WHERE id_atencion = $1", [idAtencion]);
    }
  });
  return datosFarmacia(pool, idAtencion);
}
