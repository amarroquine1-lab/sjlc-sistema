// Nombres de personas: mayúscula inicial en cada palabra ("jose perez" → "Jose Perez"), sin espacios de más.
export const mayusculaInicial = (t: string): string =>
  t.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
