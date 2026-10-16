import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { conexionDueno } from "./conexion.js";
import {
  calcularVerificadorScram,
  calcularChecksum,
  exigirVariables,
  ordenarArchivosMigracion,
} from "./utilidades.js";

const CLAVE_BLOQUEO = 7340001;

async function principal(): Promise<void> {
  const { BD_CONTRASENA_APP } = exigirVariables([
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "BD_CONTRASENA_APP",
  ]);
  const dirMigraciones = path.join(process.env.DIR_DB || "/app/db", "migraciones");
  const archivos = ordenarArchivosMigracion(await readdir(dirMigraciones));

  const pool = conexionDueno();
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [CLAVE_BLOQUEO]);
    await cliente.query(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      nombre_archivo text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      fecha_aplicacion timestamptz NOT NULL DEFAULT now()
    )`);

    const { rows } = await cliente.query<{ nombre_archivo: string; checksum_sha256: string }>(
      "SELECT nombre_archivo, checksum_sha256 FROM migraciones_aplicadas",
    );
    const aplicadas = new Map(rows.map((r) => [r.nombre_archivo, r.checksum_sha256]));

    const faltantes = [...aplicadas.keys()].filter((n) => !archivos.includes(n));
    if (faltantes.length > 0) {
      throw new Error(
        `Faltan archivos de migración que ya estaban aplicados: ${faltantes.join(", ")}. No se continúa.`,
      );
    }

    for (const archivo of archivos) {
      const contenido = await readFile(path.join(dirMigraciones, archivo));
      const checksum = calcularChecksum(contenido);
      const previo = aplicadas.get(archivo);
      if (previo !== undefined) {
        if (previo !== checksum) {
          throw new Error(
            `La migración ${archivo} ya fue aplicada pero su contenido cambió. Nunca se edita una migración aplicada: agregue una nueva.`,
          );
        }
        console.log(`Omitida (ya aplicada): ${archivo}`);
        continue;
      }
      try {
        await cliente.query("BEGIN");
        await cliente.query(contenido.toString("utf8"));
        await cliente.query(
          "INSERT INTO migraciones_aplicadas (nombre_archivo, checksum_sha256) VALUES ($1, $2)",
          [archivo, checksum],
        );
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
      }
      console.log(`Aplicada: ${archivo}`);
    }

    // La contraseña del rol de la aplicación viene del .env, no de los archivos SQL.
    const rol = await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = 'sjlc_app'");
    if (rol.rowCount && rol.rowCount > 0) {
      // Se envía el verificador SCRAM (no la contraseña): no queda en el texto de la sentencia ni en los registros.
      await cliente.query(`ALTER ROLE sjlc_app PASSWORD ${cliente.escapeLiteral(calcularVerificadorScram(BD_CONTRASENA_APP))}`);
      console.log("Contraseña del rol sjlc_app actualizada desde el entorno.");
    }
  } finally {
    await cliente.query("SELECT pg_advisory_unlock($1)", [CLAVE_BLOQUEO]).catch(() => undefined);
    cliente.release();
    await pool.end();
  }
}

principal().catch((error: Error) => {
  console.error(`Error en migraciones: ${error.message}`);
  process.exit(1);
});
