// Generación del nombre de usuario: inicial del primer nombre + primer apellido (sin partículas),
// en minúsculas y solo a-z (sin tildes ni ñ).
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "san", "santa"]);

export function aSoloLetras(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export function primerApellido(apellidos: string): string {
  const palabras = apellidos.trim().split(/\s+/).filter(Boolean);
  const util = palabras.find((p) => !PARTICULAS.has(aSoloLetras(p)) && aSoloLetras(p) !== "");
  return aSoloLetras(util ?? palabras[palabras.length - 1] ?? "");
}

// Candidatos en orden: inicial+apellido, luego dos letras del nombre, tres, etc.
export function candidatosNombreUsuario(nombres: string, apellidos: string): string[] {
  const primerNombre = aSoloLetras(nombres.trim().split(/\s+/)[0] ?? "");
  const apellido = primerApellido(apellidos);
  if (!primerNombre || !apellido) return [];
  const candidatos: string[] = [];
  for (let k = 1; k <= primerNombre.length; k++) candidatos.push(primerNombre.slice(0, k) + apellido);
  return candidatos.filter((c) => c.length <= 30);
}

export function elegirNombreUsuario(candidatos: string[], existentes: Set<string>): string | null {
  return candidatos.find((c) => !existentes.has(c)) ?? null;
}
