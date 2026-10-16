import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

// Funciones puras de la capa de base de datos (fáciles de probar).

const PATRON_MIGRACION = /^(\d+)_.+\.sql$/;

export function esArchivoMigracion(nombre: string): boolean {
  return PATRON_MIGRACION.test(nombre);
}

// Ordena por el número inicial (NNN) y, si empatan, por nombre.
export function ordenarArchivosMigracion(nombres: string[]): string[] {
  return nombres
    .filter(esArchivoMigracion)
    .sort((a, b) => {
      const na = Number(PATRON_MIGRACION.exec(a)![1]);
      const nb = Number(PATRON_MIGRACION.exec(b)![1]);
      return na !== nb ? na - nb : a.localeCompare(b);
    });
}

export function calcularChecksum(contenido: string | Buffer): string {
  return createHash("sha256").update(contenido).digest("hex");
}

export function validarNombreUsuario(nombreUsuario: string): boolean {
  return /^[a-z]+$/.test(nombreUsuario);
}

export function validarContrasena(contrasena: string): boolean {
  return contrasena.length >= 10;
}

// Todo menos la última palabra son los nombres; la última, los apellidos.
export function dividirNombre(nombreCompleto: string): { nombres: string; apellidos: string } {
  const palabras = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length < 2) {
    throw new Error(
      "El nombre debe tener al menos dos palabras (nombres y apellido), por ejemplo \"Abner Marroquin\".",
    );
  }
  return {
    nombres: palabras.slice(0, -1).join(" "),
    apellidos: palabras[palabras.length - 1],
  };
}

export function exigirVariables(nombres: string[]): Record<string, string> {
  const faltan = nombres.filter((n) => !process.env[n]?.trim());
  if (faltan.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${faltan.join(", ")}.`);
  }
  return Object.fromEntries(nombres.map((n) => [n, process.env[n] as string]));
}

// Verificador SCRAM-SHA-256 (RFC 5802 / 7677) para ALTER ROLE ... PASSWORD: PostgreSQL lo acepta
// ya calculado, así la contraseña nunca viaja en el texto de la sentencia ni queda en los registros.
export function calcularVerificadorScram(
  contrasena: string,
  sal: Buffer = randomBytes(16),
  iteraciones = 4096,
): string {
  const salada = pbkdf2Sync(contrasena.normalize("NFKC"), sal, iteraciones, 32, "sha256");
  const claveCliente = createHmac("sha256", salada).update("Client Key").digest();
  const claveAlmacenada = createHash("sha256").update(claveCliente).digest();
  const claveServidor = createHmac("sha256", salada).update("Server Key").digest();
  return `SCRAM-SHA-256$${iteraciones}:${sal.toString("base64")}$${claveAlmacenada.toString("base64")}:${claveServidor.toString("base64")}`;
}
