// Clasifica el texto de un solo campo de búsqueda (sección 10.1 de la especificación): código, CUI/DPI, fecha de nacimiento,
// número de atención o nombre parcial (sin importar tildes ni mayúsculas).
export type Consulta =
  | { tipo: "codigo"; codigo: string }
  | { tipo: "atencion"; numero: string }
  | { tipo: "cui"; cui: string }
  | { tipo: "fecha"; fecha: string }
  | { tipo: "nombre"; palabras: string[] }
  | { tipo: "vacia" };

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function clasificar(texto: string): Consulta {
  const t = texto.trim();
  if (!t) return { tipo: "vacia" };
  let m: RegExpExecArray | null;
  if ((m = /^sjlc-?(\d{1,9})$/i.exec(t))) return { tipo: "codigo", codigo: `SJLC-${m[1].padStart(6, "0")}` };
  if ((m = /^a-?(\d{1,9})$/i.exec(t))) return { tipo: "atencion", numero: `A-${m[1].padStart(6, "0")}` };
  const soloDigitos = t.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(soloDigitos)) return { tipo: "cui", cui: soloDigitos };
  if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t))) { const f = fechaValida(Number(m[3]), Number(m[2]), Number(m[1])); if (f) return { tipo: "fecha", fecha: f }; }
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) { const f = fechaValida(Number(m[1]), Number(m[2]), Number(m[3])); if (f) return { tipo: "fecha", fecha: f }; }
  if (/^\d{1,7}$/.test(t)) return { tipo: "codigo", codigo: `SJLC-${t.padStart(6, "0")}` };
  const palabras = t.split(/\s+/).map((p) => p.replace(/[\\%_]/g, (c) => `\\${c}`)).filter((p) => p.length > 0);
  return { tipo: "nombre", palabras };
}
