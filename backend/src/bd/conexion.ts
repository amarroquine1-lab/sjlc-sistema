import pg from "pg";
import { exigirVariables } from "./utilidades.js";

const { Pool } = pg;

function base() {
  return {
    host: process.env.BD_HOST || "bd",
    port: Number(process.env.BD_PUERTO || 5432),
    // La trazabilidad y los reportes dependen de la hora de Guatemala aunque la base corra con otra configuración.
    options: "-c timezone=America/Guatemala",
  };
}

// Dueño de la BD: solo para migraciones y seeds.
export function conexionDueno(): pg.Pool {
  const v = exigirVariables(["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]);
  return new Pool({
    ...base(),
    user: v.POSTGRES_USER,
    password: v.POSTGRES_PASSWORD,
    database: v.POSTGRES_DB,
    max: 2,
  });
}

// Usuario de la aplicación, con privilegios mínimos.
export function conexionApp(): pg.Pool {
  const v = exigirVariables(["POSTGRES_DB", "BD_CONTRASENA_APP"]);
  return new Pool({
    ...base(),
    user: "sjlc_app",
    password: v.BD_CONTRASENA_APP,
    database: v.POSTGRES_DB,
    max: 10,
  });
}

export interface ContextoAuditoria {
  idUsuario: number | null;
  direccionIp: string | null;
}

// Transacción que informa a los triggers de la BD quién escribe y desde dónde.
export async function conTransaccion<T>(
  pool: pg.Pool,
  contexto: ContextoAuditoria,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(
      "SELECT set_config('sjlc.id_usuario', $1, true), set_config('sjlc.direccion_ip', $2, true)",
      [contexto.idUsuario === null ? "" : String(contexto.idUsuario), contexto.direccionIp ?? ""],
    );
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    try {
      await cliente.query("ROLLBACK");
    } catch {
      // la conexión ya pudo haberse perdido
    }
    throw error;
  } finally {
    cliente.release();
  }
}
