// Cálculos del dominio en un solo lugar (el frontend no recalcula). Las fechas son "AAAA-MM-DD".
export interface Edad { anios: number; meses: number; dias: number; texto: string }

function partes(fecha: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

// Edad completa en años, meses y días a la fecha "hoy". Si hoy es anterior al nacimiento, lanza error.
export function calcularEdad(nacimiento: string, hoy: string): Edad {
  const [ya, ma, da] = partes(nacimiento);
  const [yh, mh, dh] = partes(hoy);
  let anios = yh - ya;
  let meses = mh - ma;
  let dias = dh - da;
  if (dias < 0) { meses -= 1; dias += diasDelMes(mh === 1 ? yh - 1 : yh, mh === 1 ? 12 : mh - 1); }
  if (meses < 0) { anios -= 1; meses += 12; }
  if (anios < 0) throw new Error("La fecha de nacimiento es posterior a la fecha actual.");
  return { anios, meses, dias, texto: textoEdad(anios, meses, dias) };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Menores de 1 año: meses y días; de 1 a 4 años: años y meses; de 5 en adelante: años.
export function textoEdad(anios: number, meses: number, dias: number): string {
  if (anios === 0 && meses === 0) return plural(dias, "día", "días");
  if (anios === 0) return meses < 3 && dias > 0 ? `${plural(meses, "mes", "meses")} y ${plural(dias, "día", "días")}` : plural(meses, "mes", "meses");
  if (anios < 5) return meses > 0 ? `${plural(anios, "año", "años")} y ${plural(meses, "mes", "meses")}` : plural(anios, "año", "años");
  return plural(anios, "año", "años");
}

export const esMenorDeEdad = (nacimiento: string, hoy: string): boolean => calcularEdad(nacimiento, hoy).anios < 18;

// Formato de la ficha de papel: "J. Pérez", nombre y primera letra del apellido (ticket).
export function nombreCorto(nombres: string | null, apellidos: string | null): string {
  const n = (nombres ?? "").trim().split(/\s+/)[0] ?? "";
  const a = (apellidos ?? "").trim().charAt(0);
  return [n, a ? `${a.toUpperCase()}.` : ""].filter(Boolean).join(" ") || "Sin identificar";
}

// Verificación de la estructura del CUI/DPI: 13 dígitos; los últimos 4 son departamento (2) y municipio (2).
// El dígito verificador (mod 11, pesos 2 a 9) se informa como advertencia y no bloquea el registro.
export interface ResultadoCui { formatoValido: boolean; codigoMunicipio: number | null; verificadorCorrecto: boolean }
export function revisarCui(cui: string): ResultadoCui {
  if (!/^\d{13}$/.test(cui)) return { formatoValido: false, codigoMunicipio: null, verificadorCorrecto: false };
  const numero = cui.slice(0, 8);
  const verificador = Number(cui[8]);
  let total = 0;
  for (let i = 0; i < 8; i++) total += Number(numero[i]) * (i + 2);
  return {
    formatoValido: true,
    codigoMunicipio: Number(cui.slice(9, 11)) * 100 + Number(cui.slice(11, 13)),
    verificadorCorrecto: total % 11 === verificador,
  };
}

// IMC = peso (kg) / talla (m)². Se calcula aquí y no se guarda. La categoría solo aplica a adultos (18 años o más).
export interface ResultadoImc { imc: number; categoria: string | null }
export function calcularImc(pesoKg: number | null | undefined, tallaCm: number | null | undefined, esAdulto: boolean): ResultadoImc | null {
  if (!pesoKg || !tallaCm || pesoKg <= 0 || tallaCm <= 0) return null;
  const m = tallaCm / 100;
  const imc = Math.round((pesoKg / (m * m)) * 10) / 10;
  if (!esAdulto) return { imc, categoria: null };
  const categoria = imc < 18.5 ? "Bajo peso" : imc < 25 ? "Peso normal" : imc < 30 ? "Sobrepeso" : "Obesidad";
  return { imc, categoria };
}

// El peso se captura y se muestra en libras; la base guarda kilogramos con 2 decimales (única conversión del sistema).
const KG_POR_LIBRA = 0.45359237;
export const libraAKg = (lb: number): number => Math.round(lb * KG_POR_LIBRA * 100) / 100;
export const kgALibra = (kg: number): number => Math.round((kg / KG_POR_LIBRA) * 10) / 10;
