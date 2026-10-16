import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regla: ninguna consulta se arma concatenando datos. Las plantillas con ${} solo pueden llevar
// fragmentos fijos conocidos (columnas, FROM y placeholders $n armados por el propio servicio).
// ALTER ROLE no admite parámetros: el valor va escapado con escapeLiteral y es el verificador SCRAM, no la contraseña.
const PERMITIDAS = new Set(["COLUMNAS", "DESDE", "donde", "valores.length", "valores.length - 1", "BASE", "orden", "SQL_ATENCION", "FILAS", "SQL_DESDE", "PH_LIMITE", "PH_DESPLAZAMIENTO", 'bloquear ? "FOR UPDATE OF r" : ""', "cliente.escapeLiteral(calcularVerificadorScram(BD_CONTRASENA_APP))"]);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("consultas parametrizadas", () => {
  it("las consultas con plantilla solo interpolan fragmentos fijos permitidos", () => {
    const problemas: string[] = [];
    for (const archivo of archivos(path.resolve(__dirname, "../../src"))) {
      const texto = readFileSync(archivo, "utf8");
      for (const m of texto.matchAll(/\.query(?:<[^>]*>)?\(\s*`([^`]*)`/g)) {
        for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) {
          if (!PERMITIDAS.has(e[1].trim())) problemas.push(`${path.basename(archivo)}: \${${e[1]}}`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});
