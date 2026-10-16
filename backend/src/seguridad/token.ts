import jwt from "jsonwebtoken";

export const NOMBRE_COOKIE = "sjlc_sesion";
export const SEGUNDOS_TOKEN = 15 * 60;

export interface DatosToken {
  idUsuario: number;
  idSesion: string;
}

export function firmarToken(datos: DatosToken, secreto: string, ahoraSeg = Math.floor(Date.now() / 1000)): string {
  return jwt.sign({ iat: ahoraSeg }, secreto, {
    algorithm: "HS256",
    subject: String(datos.idUsuario),
    jwtid: datos.idSesion,
    expiresIn: SEGUNDOS_TOKEN,
  });
}

export type ResultadoToken =
  | { estado: "valido"; datos: DatosToken }
  | { estado: "expirado"; datos: DatosToken }
  | { estado: "invalido" };

// Se fija el algoritmo: un token con alg "none" u otro algoritmo se rechaza.
export function leerToken(token: string, secreto: string): ResultadoToken {
  try {
    const p = jwt.verify(token, secreto, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    return convertir(p, "valido");
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      try {
        const p = jwt.verify(token, secreto, { algorithms: ["HS256"], ignoreExpiration: true }) as jwt.JwtPayload;
        return convertir(p, "expirado");
      } catch {
        return { estado: "invalido" };
      }
    }
    return { estado: "invalido" };
  }
}

function convertir(p: jwt.JwtPayload, estado: "valido" | "expirado"): ResultadoToken {
  const idUsuario = Number(p.sub);
  if (!Number.isInteger(idUsuario) || typeof p.jti !== "string") return { estado: "invalido" };
  return { estado, datos: { idUsuario, idSesion: p.jti } };
}
