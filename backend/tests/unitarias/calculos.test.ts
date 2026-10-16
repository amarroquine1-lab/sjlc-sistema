import { describe, expect, it } from "vitest";
import { calcularEdad, calcularImc, esMenorDeEdad, nombreCorto, revisarCui, textoEdad } from "../../src/servicios/calculos.js";
import { clasificar } from "../../src/modulos/pacientes/busqueda.js";

describe("edad", () => {
  it("calcula años, meses y días completos", () => {
    expect(calcularEdad("1990-05-20", "2026-10-15")).toMatchObject({ anios: 36, meses: 4, dias: 25 });
    expect(calcularEdad("2026-10-15", "2026-10-15")).toMatchObject({ anios: 0, meses: 0, dias: 0 });
  });
  it("respeta cumpleaños y fin de mes", () => {
    expect(calcularEdad("2000-02-29", "2001-02-28")).toMatchObject({ anios: 0, meses: 11, dias: 30 });
    expect(calcularEdad("2000-02-29", "2004-02-29")).toMatchObject({ anios: 4, meses: 0, dias: 0 });
    expect(calcularEdad("2008-10-16", "2026-10-15")).toMatchObject({ anios: 17, meses: 11, dias: 29 });
    expect(calcularEdad("2008-10-15", "2026-10-15")).toMatchObject({ anios: 18, meses: 0, dias: 0 });
  });
  it("cruza el cambio de año", () => {
    expect(calcularEdad("2025-12-31", "2026-01-01")).toMatchObject({ anios: 0, meses: 0, dias: 1 });
    expect(calcularEdad("2025-11-30", "2026-01-31")).toMatchObject({ anios: 0, meses: 2, dias: 1 });
  });
  it("rechaza una fecha de nacimiento futura", () => {
    expect(() => calcularEdad("2027-01-01", "2026-10-15")).toThrow();
  });
  it("texto de la edad según el tramo", () => {
    expect(textoEdad(0, 0, 9)).toBe("9 días");
    expect(textoEdad(0, 1, 5)).toBe("1 mes y 5 días");
    expect(textoEdad(0, 8, 3)).toBe("8 meses");
    expect(textoEdad(2, 3, 0)).toBe("2 años y 3 meses");
    expect(textoEdad(1, 0, 4)).toBe("1 año");
    expect(textoEdad(36, 4, 25)).toBe("36 años");
  });
  it("mayoría de edad a los 18", () => {
    expect(esMenorDeEdad("2008-10-16", "2026-10-15")).toBe(true);
    expect(esMenorDeEdad("2008-10-15", "2026-10-15")).toBe(false);
  });
});

describe("ticket y CUI", () => {
  it("nombre corto: nombre e inicial del apellido", () => {
    expect(nombreCorto("María Elena", "Velásquez Cofuentes")).toBe("María V.");
    expect(nombreCorto(null, null)).toBe("Sin identificar");
    expect(nombreCorto("Ana", "")).toBe("Ana");
  });
  it("revisa el formato, el municipio y el dígito verificador del CUI", () => {
    expect(revisarCui("1234567890108")).toEqual({ formatoValido: true, codigoMunicipio: 108, verificadorCorrecto: true });
    expect(revisarCui("1234567800108")).toMatchObject({ formatoValido: true, verificadorCorrecto: false });
    expect(revisarCui("12345")).toMatchObject({ formatoValido: false });
    expect(revisarCui("12345678901AB")).toMatchObject({ formatoValido: false });
  });
});

describe("clasificación de la búsqueda de un solo campo", () => {
  it("código, con o sin prefijo", () => {
    expect(clasificar("SJLC-000123")).toEqual({ tipo: "codigo", codigo: "SJLC-000123" });
    expect(clasificar("sjlc123")).toEqual({ tipo: "codigo", codigo: "SJLC-000123" });
    expect(clasificar("123")).toEqual({ tipo: "codigo", codigo: "SJLC-000123" });
  });
  it("número de atención", () => { expect(clasificar("A-004587")).toEqual({ tipo: "atencion", numero: "A-004587" }); });
  it("CUI con espacios o guiones", () => {
    expect(clasificar("1234 56789 0108")).toEqual({ tipo: "cui", cui: "1234567890108" });
    expect(clasificar("1234-5678-90108")).toEqual({ tipo: "cui", cui: "1234567890108" });
  });
  it("fecha en varios formatos y rechazo de fechas imposibles", () => {
    expect(clasificar("05/03/1990")).toEqual({ tipo: "fecha", fecha: "1990-03-05" });
    expect(clasificar("5-3-1990")).toEqual({ tipo: "fecha", fecha: "1990-03-05" });
    expect(clasificar("1990-03-05")).toEqual({ tipo: "fecha", fecha: "1990-03-05" });
    expect(clasificar("31/02/1990").tipo).not.toBe("fecha");
  });
  it("nombre parcial, y escapa comodines", () => {
    expect(clasificar("  José   Pérez ")).toEqual({ tipo: "nombre", palabras: ["José", "Pérez"] });
    expect(clasificar("100%_x")).toEqual({ tipo: "nombre", palabras: ["100\\%\\_x"] });
    expect(clasificar("   ")).toEqual({ tipo: "vacia" });
  });
});

describe("IMC", () => {
  it("peso / talla² con un decimal y categoría solo para adultos", () => {
    expect(calcularImc(52.3, 148, true)).toEqual({ imc: 23.9, categoria: "Peso normal" });
    expect(calcularImc(45, 170, true)).toEqual({ imc: 15.6, categoria: "Bajo peso" });
    expect(calcularImc(80, 170, true)).toEqual({ imc: 27.7, categoria: "Sobrepeso" });
    expect(calcularImc(100, 170, true)).toEqual({ imc: 34.6, categoria: "Obesidad" });
    expect(calcularImc(18.2, 110, false)).toEqual({ imc: 15, categoria: null });
  });
  it("sin peso o talla no hay IMC", () => {
    expect(calcularImc(null, 150, true)).toBeNull();
    expect(calcularImc(50, undefined, true)).toBeNull();
    expect(calcularImc(0, 150, true)).toBeNull();
  });
});

import { kgALibra, libraAKg } from "../../src/servicios/calculos.js";
import { mayusculaInicial } from "../../src/servicios/texto.js";
describe("peso en libras y nombres", () => {
  it("convierte libras a kilogramos con 2 decimales y de regreso con 1", () => {
    expect(libraAKg(150)).toBe(68.04);
    expect(kgALibra(68.04)).toBe(150);
    expect(libraAKg(0.7)).toBe(0.32);
    expect(libraAKg(660)).toBe(299.37);
    expect(kgALibra(libraAKg(115.5))).toBe(115.5);
  });
  it("pone mayúscula inicial a cada palabra de los nombres", () => {
    expect(mayusculaInicial("jose perez")).toBe("Jose Perez");
    expect(mayusculaInicial("  MARÍA   de los ángeles ")).toBe("María De Los Ángeles");
    expect(mayusculaInicial("ana-lucía o'brien")).toBe("Ana-Lucía O'Brien");
  });
});
