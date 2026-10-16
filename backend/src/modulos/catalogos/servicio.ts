import type pg from "pg";
import { conTransaccion } from "../../bd/conexion.js";
import { ErrorApi } from "../../comun/errores.js";
import type { Actor } from "../pacientes/servicio.js";

export async function catalogosFormulario(pool: pg.Pool) {
  const [dep, pue, com, col] = await Promise.all([
    pool.query("SELECT id_departamento, nombre_departamento FROM departamentos ORDER BY id_departamento"),
    pool.query("SELECT id_pueblo, nombre_pueblo FROM pueblos ORDER BY id_pueblo"),
    pool.query("SELECT id_comunidad_linguistica, nombre_comunidad_linguistica FROM comunidades_linguisticas ORDER BY id_comunidad_linguistica"),
    pool.query(`SELECT cs.id_colonia_sector, cs.id_municipio, cs.zona, cs.nombre_colonia_sector, cs.sector_centro, cs.activo
                  FROM colonias_sectores cs WHERE cs.activo ORDER BY cs.nombre_colonia_sector`),
  ]);
  return { departamentos: dep.rows, pueblos: pue.rows, comunidades_linguisticas: com.rows, colonias_sectores: col.rows };
}

export async function listarMunicipios(pool: pg.Pool, f: { q?: string; id_departamento?: number }) {
  const valores: unknown[] = [];
  let donde = "TRUE";
  if (f.id_departamento) { valores.push(f.id_departamento); donde += ` AND m.id_departamento = $${valores.length}`; }
  if (f.q) { valores.push(f.q.replace(/[\\%_]/g, (c) => `\\${c}`)); donde += ` AND public.unaccent_inmutable(lower(m.nombre_municipio)) LIKE '%' || public.unaccent_inmutable(lower($${valores.length})) || '%'`; }
  const r = await pool.query(
    "SELECT m.id_municipio, m.id_departamento, m.nombre_municipio, d.nombre_departamento FROM municipios m JOIN departamentos d USING (id_departamento) WHERE " + donde + " ORDER BY d.id_departamento, m.nombre_municipio LIMIT 400", valores);
  return r.rows;
}

export async function crearColonia(pool: pg.Pool, actor: Actor, d: { id_municipio: number; zona: number; nombre_colonia_sector: string; sector_centro?: string | null }) {
  try {
    return await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, async (c) => {
      const r = await c.query("INSERT INTO colonias_sectores (id_municipio, zona, nombre_colonia_sector, sector_centro) VALUES ($1, $2, $3, $4) RETURNING id_colonia_sector, id_municipio, zona, nombre_colonia_sector, sector_centro, activo",
        [d.id_municipio, d.zona, d.nombre_colonia_sector.trim(), d.sector_centro ?? null]);
      return r.rows[0];
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new ErrorApi(409, "COLONIA_REPETIDA", "Esa colonia o sector ya está en la lista.");
    throw error;
  }
}

export async function editarColonia(pool: pg.Pool, actor: Actor, id: number, d: { nombre_colonia_sector?: string; sector_centro?: string | null; activo?: boolean }) {
  const r = await conTransaccion(pool, { idUsuario: actor.idUsuario, direccionIp: actor.ip }, (c) => c.query(
    `UPDATE colonias_sectores SET nombre_colonia_sector = COALESCE($2, nombre_colonia_sector), sector_centro = CASE WHEN $3::boolean THEN $4 ELSE sector_centro END, activo = COALESCE($5, activo)
      WHERE id_colonia_sector = $1 RETURNING id_colonia_sector, id_municipio, zona, nombre_colonia_sector, sector_centro, activo`,
    [id, d.nombre_colonia_sector?.trim() ?? null, d.sector_centro !== undefined, d.sector_centro ?? null, d.activo ?? null]));
  if (!r.rows[0]) throw new ErrorApi(404, "COLONIA_NO_ENCONTRADA", "No se encontró la colonia o sector.");
  return r.rows[0];
}
