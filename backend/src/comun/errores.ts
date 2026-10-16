import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

// Error con código estable y mensaje en español claro para el usuario.
export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
    public readonly cabeceras?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

const MENSAJES_ZOD: Record<string, string> = {
  invalid_type: "falta o no tiene el tipo esperado",
  too_small: "es demasiado corto o pequeño",
  too_big: "es demasiado largo o grande",
  invalid_format: "no tiene el formato esperado",
  invalid_value: "no es un valor permitido",
  unrecognized_keys: "no se reconoce",
  custom: "no es válido",
};

// Nombre con el que la persona ve cada campo en pantalla.
const ETIQUETAS: Record<string, string> = {
  nombres: "Nombres", apellidos: "Apellidos", fecha_nacimiento: "Fecha de nacimiento", sexo: "Sexo", cui: "DPI/CUI", telefono: "Teléfono",
  direccion: "Dirección", peso_lb: "Peso", talla_cm: "Talla", temperatura_c: "Temperatura", presion_sistolica: "Presión alta", presion_diastolica: "Presión baja",
  frecuencia_cardiaca: "Pulso", saturacion_oxigeno: "Saturación de oxígeno", motivo_consulta: "Motivo de la consulta", medicamento: "Medicamento",
  presentacion: "Presentación", cantidad_recetada: "Cantidad", indicaciones: "Indicaciones", descripcion: "Descripción", motivo: "Motivo",
  edad_aproximada_anios: "Edad aproximada", usuario: "Usuario", contrasena: "Contraseña", fecha_aplicacion: "Fecha de aplicación", numero_dosis: "Dosis",
  diagnostico_nutricional: "Diagnóstico nutricional", parentesco: "Parentesco", id_municipio_residencia: "Municipio", zona_residencia: "Zona",
};
const INGLES = /^(Invalid|Too |Unrecognized|Expected|Input)/;

export function describirZod(error: ZodError): { campo: string; mensaje: string }[] {
  return error.issues.map((i) => {
    const campo = i.path.join(".") || "(cuerpo)";
    // Los mensajes escritos en los esquemas ya son frases completas; si no hay uno propio se arma con el nombre del campo.
    if (i.message && !INGLES.test(i.message)) return { campo, mensaje: i.message };
    const ultimo = String(i.path[i.path.length - 1] ?? "");
    const etiqueta = ETIQUETAS[ultimo] ?? ultimo.replace(/_/g, " ");
    return { campo, mensaje: `${etiqueta ? `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} ` : "El dato "}${MENSAJES_ZOD[i.code] ?? "no es válido"}.` };
  });
}

// Errores de PostgreSQL conocidos: los mensajes técnicos solo van al registro.
function desdePostgres(codigo: string): ErrorApi | null {
  switch (codigo) {
    case "42501":
      return new ErrorApi(403, "OPERACION_NO_PERMITIDA", "No tiene permiso para realizar esta operación.");
    case "23505":
      return new ErrorApi(409, "REGISTRO_DUPLICADO", "Ya existe un registro con esos datos.");
    case "23001":
      return new ErrorApi(409, "OPERACION_BLOQUEADA", "Esta operación no está permitida sobre el registro.");
    case "23503":
      return new ErrorApi(422, "REFERENCIA_INVALIDA", "Uno de los datos hace referencia a un registro que no existe.");
    case "23514":
    case "23502":
    case "22P02":
    case "22003":
    case "22001":
    case "22007":
    case "22008":
      return new ErrorApi(422, "DATOS_INVALIDOS", "Los datos enviados no son válidos.");
    default:
      return null;
  }
}

export const manejadorErrores: ErrorRequestHandler = (error, req, res, _next) => {
  let api: ErrorApi;
  if (error instanceof ErrorApi) {
    api = error;
  } else if (error instanceof ZodError) {
    const detalles = describirZod(error);
    api = new ErrorApi(422, "DATOS_INVALIDOS", detalles.slice(0, 3).map((d) => d.mensaje).join(" "), detalles);
  } else if (error?.type === "entity.parse.failed") {
    api = new ErrorApi(400, "JSON_INVALIDO", "El cuerpo de la petición no es un JSON válido.");
  } else if (error?.type === "entity.too.large") {
    api = new ErrorApi(413, "CUERPO_MUY_GRANDE", "La petición es demasiado grande.");
  } else if (typeof error?.code === "string" && desdePostgres(error.code)) {
    api = desdePostgres(error.code)!;
  } else {
    api = new ErrorApi(500, "ERROR_INTERNO", "Ocurrió un error inesperado. Intente de nuevo.");
  }
  if (api.estado >= 500) {
    req.log?.error({ err: { tipo: error?.name, codigo: error?.code, mensaje: error?.message } }, "error no controlado");
  }
  for (const [k, v] of Object.entries(api.cabeceras ?? {})) res.setHeader(k, v);
  res.status(api.estado).json({ error: { codigo: api.codigo, mensaje: api.message, ...(api.detalles ? { detalles: api.detalles } : {}) } });
};
