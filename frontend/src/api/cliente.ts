// Cliente de la API: misma procedencia, la cookie de sesión viaja sola.
export interface ErrorApi { estado: number; codigo: string; mensaje: string; detalles?: { campo: string; mensaje: string }[] }

// Errores de validación por campo: { saturacion_oxigeno: "La saturación debe estar entre 50 y 100" }.
export function erroresPorCampo(e: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (e instanceof ErrorDeApi) for (const d of e.info.detalles ?? []) { const campo = d.campo.split(".").pop() ?? d.campo; if (!salida[campo]) salida[campo] = d.mensaje; }
  return salida;
}

export class ErrorDeApi extends Error {
  constructor(public readonly info: ErrorApi) { super(info.mensaje); }
}

type Alcance = { alSesionVencida?: () => void };
const alcance: Alcance = {};
export function alVencerSesion(fn: () => void): void { alcance.alSesionVencida = fn; }

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, automatica = false): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, {
      method: metodo, credentials: "same-origin",
      // Las peticiones automáticas (sondeo de la cola) no cuentan como actividad de la persona
      headers: { ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }), ...(automatica ? { "X-Actividad": "automatica" } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorDeApi({ estado: 0, codigo: "SIN_CONEXION", mensaje: "No hay conexión con el servidor. Revise la red e intente de nuevo." });
  }
  const texto = await r.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { throw new ErrorDeApi({ estado: r.status, codigo: "RESPUESTA_INESPERADA", mensaje: "El servidor respondió de forma inesperada. Intente de nuevo en un momento." }); }
  if (!r.ok) {
    const e = datos?.error ?? {};
    const info: ErrorApi = { estado: r.status, codigo: e.codigo ?? "ERROR", mensaje: e.mensaje ?? "Ocurrió un error. Intente de nuevo.", detalles: e.detalles };
    if (r.status === 401 && (info.codigo === "SESION_EXPIRADA" || info.codigo === "NO_AUTENTICADO")) alcance.alSesionVencida?.();
    throw new ErrorDeApi(info);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string, opciones?: { automatica?: boolean }) => llamar<T>("GET", ruta, undefined, opciones?.automatica),
  post: <T>(ruta: string, cuerpo?: unknown) => llamar<T>("POST", ruta, cuerpo ?? {}),
  delete: <T>(ruta: string) => llamar<T>("DELETE", ruta),
  put: <T>(ruta: string, cuerpo: unknown) => llamar<T>("PUT", ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => llamar<T>("PATCH", ruta, cuerpo),
};
