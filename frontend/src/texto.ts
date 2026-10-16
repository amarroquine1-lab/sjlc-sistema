// Los nombres de área vienen en minúsculas desde la base de datos: se muestran con inicial mayúscula.
export const capitalizar = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

export const nombreCompleto = (p: { nombres: string | null; apellidos: string | null }): string =>
  [p.nombres, p.apellidos].filter(Boolean).join(" ") || "Persona sin identificar";

// "María L." para los mensajes de confirmación (nombre e inicial del apellido).
export const nombreBreve = (p: { nombres: string | null; apellidos: string | null }): string => {
  const n = (p.nombres ?? "").trim().split(/\s+/)[0] ?? "";
  const a = (p.apellidos ?? "").trim().charAt(0).toUpperCase();
  return [n, a ? `${a}.` : ""].filter(Boolean).join(" ") || "Persona sin identificar";
};

// Clave del área para el color y la ilustración ("signos vitales" → "signos", "nutrición" → "nutricion").
export const claveDeArea = (nombre: string | null | undefined): string | undefined => {
  if (!nombre) return undefined;
  const n = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return n.startsWith("signos") ? "signos" : n;
};
