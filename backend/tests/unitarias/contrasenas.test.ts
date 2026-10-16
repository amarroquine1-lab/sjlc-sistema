import { describe, expect, it } from "vitest";
import {
  generarContrasenaTemporal, hashearContrasena, validarPolitica, verificarContraFalso, verificarContrasena,
} from "../../src/seguridad/contrasenas.js";

describe("política de contraseñas", () => {
  it("exige mínimo 10 caracteres", () => {
    expect(validarPolitica("Corta1!")).toMatch(/al menos 10/);
    expect(validarPolitica("1234567890a")).toBeNull();
  });
  it("rechaza más de 128 caracteres", () => {
    expect(validarPolitica("a1".repeat(65))).toMatch(/más de 128/);
    expect(validarPolitica("aZ3".repeat(40) + "xyz")).toBeNull();
  });
  it("rechaza las comunes y las secuencias simples", () => {
    expect(validarPolitica("Password123")).toMatch(/común/);
    expect(validarPolitica("1234567890")).toMatch(/común|secuencia/);
    expect(validarPolitica("abcdefghijk")).toMatch(/secuencia/);
    expect(validarPolitica("aaaaaaaaaaaa")).toMatch(/repetido/);
  });
  it("rechaza contraseñas que contienen el nombre de usuario", () => {
    expect(validarPolitica("MiAmarroquin99x", { nombreUsuario: "amarroquin" })).toMatch(/nombre de usuario/);
    expect(validarPolitica("OtraClave-91Zq", { nombreUsuario: "amarroquin" })).toBeNull();
  });
  it("normaliza NFKC antes de contar", () => {
    expect(validarPolitica("ｐａｓｓｗｏｒｄ１２３")).toMatch(/común/);
  });
});

describe("argon2id", () => {
  it("genera hashes argon2id con los parámetros de OWASP y verifica", async () => {
    const h = await hashearContrasena("Clave-de-prueba-91");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verificarContrasena(h, "Clave-de-prueba-91")).toBe(true);
    expect(await verificarContrasena(h, "clave-de-prueba-91")).toBe(false);
    expect(await verificarContrasena("no-es-un-hash", "x")).toBe(false);
  });
  it("el hash falso no lanza errores (usuario inexistente)", async () => {
    await expect(verificarContraFalso("cualquiera")).resolves.toBeUndefined();
  });
});

describe("contraseña temporal", () => {
  it("tiene 14 caracteres, sin ambiguos, con mayúscula, minúscula y dígito", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const t = generarContrasenaTemporal();
      expect(t).toHaveLength(14);
      expect(t).not.toMatch(/[0O1lI]/);
      expect(t).toMatch(/[A-Z]/);
      expect(t).toMatch(/[a-z]/);
      expect(t).toMatch(/[2-9]/);
      expect(validarPolitica(t)).toBeNull();
      vistas.add(t);
    }
    expect(vistas.size).toBe(300);
  });
});
