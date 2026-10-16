import type { Request } from "express";

// ÚNICA fuente de la IP del cliente. Express la saca de X-Forwarded-For solo cuando la conexión
// directa viene de una red interna (trust proxy); Nginx REEMPLAZA esa cabecera con la IP real
// (resuelta desde CF-Connecting-IP). Nunca se usa la IP del socket como IP del cliente.
export function normalizarIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.replace(/^::ffff:/i, "");
}

export function ipCliente(req: Request): string | null {
  return normalizarIp(req.ip);
}
