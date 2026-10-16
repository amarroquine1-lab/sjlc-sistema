// Lee y valida el entorno al arrancar. Nunca se imprimen valores secretos.
export interface Configuracion {
  entorno: string;
  puerto: number;
  jwtSecreto: string;
  /** Redes desde las que se confía en X-Forwarded-For (solo la red interna: Nginx). false = nadie. */
  proxyConfiable: string[] | false;
  origenesPermitidos: string[];
  limiteGeneral: number;
  /** Fallos de ingreso por IP cada 15 minutos. Todo el centro sale por una sola IP pública: no debe ser bajo. */
  limiteFallosIp: number;
  minutosInactividad: number;
  /** Hora (HH:MM, Guatemala) a la que las atenciones abiertas pasan a "no concluida". */
  horaCierre: string;
  /** Falso solo en el entorno de pruebas: evita que el cierre del día cierre atenciones en medio de una prueba. */
  cierreAutomatico: boolean;
  /** Datos del centro: prellenan el registro de pacientes (zona 10 de Mixco, Guatemala). */
  centro: { nombre: string; idDepartamento: number; idMunicipio: number; zona: number };
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const jwtSecreto = env.JWT_SECRETO ?? "";
  if (jwtSecreto.length < 32) {
    throw new Error("JWT_SECRETO debe tener al menos 32 caracteres.");
  }
  const entorno = (env.ENTORNO ?? "").trim();
  if (!["desarrollo", "pruebas", "produccion"].includes(entorno)) {
    throw new Error("ENTORNO debe ser desarrollo, pruebas o produccion.");
  }
  const crudoProxy = (env.PROXY_CONFIABLE ?? "").trim();
  const proxyConfiable: string[] | false =
    crudoProxy === "false"
      ? false
      : crudoProxy === ""
        ? ["loopback", "uniquelocal"]
        : crudoProxy.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    entorno,
    puerto: Number(env.PUERTO_BACKEND ?? 3000),
    jwtSecreto,
    proxyConfiable,
    origenesPermitidos: (env.ORIGENES_PERMITIDOS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    limiteGeneral: Number(env.LIMITE_GENERAL ?? 600),
    limiteFallosIp: Number(env.LIMITE_FALLOS_IP ?? 60),
    minutosInactividad: 15,
    cierreAutomatico: env.CIERRE_AUTOMATICO !== "no",
    horaCierre: /^([01]\d|2[0-3]):[0-5]\d$/.test(env.HORA_CIERRE ?? "") ? (env.HORA_CIERRE as string) : "20:00",
    centro: {
      nombre: env.CENTRO_NOMBRE ?? "Centro de Salud San José La Comunidad",
      idDepartamento: Number(env.CENTRO_ID_DEPARTAMENTO ?? 1),
      idMunicipio: Number(env.CENTRO_ID_MUNICIPIO ?? 108),
      zona: Number(env.CENTRO_ZONA ?? 10),
    },
  };
}
