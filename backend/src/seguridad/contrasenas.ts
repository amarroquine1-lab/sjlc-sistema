import { randomInt } from "node:crypto";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { CONTRASENAS_COMUNES } from "./comunes.js";

// Parámetros recomendados por OWASP para argon2id (19 MiB, 2 pasadas, 1 hilo).
const OPCIONES = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MINIMO = 10;
export const MAXIMO = 128;

export function normalizar(contrasena: string): string {
  return contrasena.normalize("NFKC");
}

export interface ContextoPolitica {
  nombreUsuario?: string;
  nombres?: string;
  apellidos?: string;
}

// Devuelve el motivo del rechazo en español, o null si la contraseña cumple la política.
export function validarPolitica(contrasena: string, contexto: ContextoPolitica = {}): string | null {
  const c = normalizar(contrasena);
  if (c.length < MINIMO) return `La contraseña debe tener al menos ${MINIMO} caracteres.`;
  if (c.length > MAXIMO) return `La contraseña no puede tener más de ${MAXIMO} caracteres.`;
  const minusculas = c.toLowerCase();
  if (contexto.nombreUsuario && minusculas.includes(contexto.nombreUsuario.toLowerCase())) {
    return "La contraseña no puede contener su nombre de usuario.";
  }
  if (CONTRASENAS_COMUNES.has(minusculas)) return "Esa contraseña es demasiado común. Elija otra.";
  if (/^(.)\1+$/.test(c)) return "La contraseña no puede ser un mismo carácter repetido.";
  if (esSecuenciaSimple(minusculas)) return "La contraseña no puede ser una secuencia simple como 1234567890 o abcdefghij.";
  return null;
}

function esSecuenciaSimple(s: string): boolean {
  if (s.length < 6) return false;
  let sube = true;
  let baja = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) sube = false;
    if (d !== -1) baja = false;
  }
  return sube || baja;
}

export async function hashearContrasena(contrasena: string): Promise<string> {
  return hash(normalizar(contrasena), OPCIONES);
}

export async function verificarContrasena(hashGuardado: string, contrasena: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, normalizar(contrasena));
  } catch {
    return false;
  }
}

let hashFalso: Promise<string> | null = null;
// Cuando el usuario no existe se verifica contra un hash falso para que el tiempo de respuesta sea parecido.
export async function verificarContraFalso(contrasena: string): Promise<void> {
  hashFalso ??= hashearContrasena(`falso-${randomInt(1e9)}-no-es-una-contrasena`);
  await verificarContrasena(await hashFalso, contrasena);
}

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const DIGITOS = "23456789";
const ALFABETO = MAYUSCULAS + MINUSCULAS + DIGITOS;

// 14 caracteres, sin símbolos ambiguos (0 O 1 l I), con al menos una mayúscula, una minúscula y un dígito.
export function generarContrasenaTemporal(): string {
  const caracteres = [
    MAYUSCULAS[randomInt(MAYUSCULAS.length)],
    MINUSCULAS[randomInt(MINUSCULAS.length)],
    DIGITOS[randomInt(DIGITOS.length)],
  ];
  while (caracteres.length < 14) caracteres.push(ALFABETO[randomInt(ALFABETO.length)]);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}
