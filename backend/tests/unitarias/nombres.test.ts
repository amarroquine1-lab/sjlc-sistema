import { describe, expect, it } from "vitest";
import { aSoloLetras, candidatosNombreUsuario, elegirNombreUsuario, primerApellido } from "../../src/modulos/usuarios/nombres.js";

describe("nombre de usuario", () => {
  it("inicial del primer nombre + primer apellido", () => {
    expect(candidatosNombreUsuario("Abner", "Marroquín")[0]).toBe("amarroquin");
    expect(candidatosNombreUsuario("José Luis", "Pérez García")[0]).toBe("jperez");
    expect(candidatosNombreUsuario("Denice", "Barrientos")[0]).toBe("dbarrientos");
  });
  it("quita tildes y ñ, solo a-z", () => {
    expect(aSoloLetras("Ñandú-Ibáñez 2")).toBe("nanduibanez");
    expect(candidatosNombreUsuario("Úrsula", "Muñoz")[0]).toBe("umunoz");
  });
  it("salta las partículas del apellido", () => {
    expect(primerApellido("de la Cruz López")).toBe("cruz");
    expect(primerApellido("De León")).toBe("leon");
    expect(primerApellido("San Martín Díaz")).toBe("martin");
    expect(candidatosNombreUsuario("María", "de los Ángeles Ruiz")[0]).toBe("mangeles");
  });
  it("si ya existe, agrega la siguiente letra del nombre", () => {
    const c = candidatosNombreUsuario("Juan", "López");
    expect(c.slice(0, 3)).toEqual(["jlopez", "julopez", "jualopez"]);
    expect(elegirNombreUsuario(c, new Set(["jlopez"]))).toBe("julopez");
    expect(elegirNombreUsuario(c, new Set(["jlopez", "julopez"]))).toBe("jualopez");
    expect(elegirNombreUsuario(c, new Set(c))).toBeNull();
  });
  it("sin letras utilizables no genera candidatos", () => {
    expect(candidatosNombreUsuario("123", "456")).toEqual([]);
  });
});
