import { describe, expect, it } from "vitest";
import { type Accion, PERMISOS, ROLES, rolTienePermiso } from "../../src/seguridad/permisos.js";

// Tabla literal de la matriz de permisos de la especificación (sección 8) (columnas: Admin, Recepción, Signos, Doctor, Nutrición, Vacunación, Farmacia).
const TABLA: Record<string, string> = {
  registrar_paciente: "X X . . . . .",
  ver_paciente: "X X X X X X X",
  abrir_atencion: "X X . . . . .",
  unir_pacientes: "X X . . . . .",
  marcar_se_retiro: "X X . . . . .",
  registrar_signos: "X . X . . . .",
  diagnostico_conducta_control: "X . . X . . .",
  receta: "X . . X X . .",
  proximo_control: "X . . X X X .",
  evaluacion_nutricional: "X . . . X . .",
  registro_vacunas: "X . . . . X .",
  entrega_medicamentos: "X . . . . . X",
  ver_historial: "X X X X X X X",
  atender_cola: "X . X X X X X",
  atender_signos: "X . X . . . .",
  atender_doctor: "X . . X . . .",
  atender_nutricion: "X . . . X . .",
  atender_vacunacion: "X . . . . X .",
  atender_farmacia: "X . . . . . X",
  "usuarios.administrar": "X . . . . . .",
  "roles.listar": "X . . . . . .",
  administracion: "X . . . . . .",
};

describe("matriz de permisos (sección 8 de la especificación)", () => {
  it("coincide con la tabla literal", () => {
    for (const [accion, fila] of Object.entries(TABLA)) {
      const marcas = fila.split(" ");
      ROLES.forEach((rol, i) => {
        expect(rolTienePermiso(rol, accion as Accion), `${accion} / ${rol}`).toBe(marcas[i] === "X");
      });
    }
    expect(Object.keys(PERMISOS).sort()).toEqual(Object.keys(TABLA).sort());
  });
  it("el administrador tiene todos los permisos", () => {
    for (const accion of Object.keys(PERMISOS)) expect(rolTienePermiso("administrador", accion as Accion)).toBe(true);
  });
  it("un rol desconocido no tiene ninguno", () => {
    for (const accion of Object.keys(PERMISOS)) expect(rolTienePermiso("intruso", accion as Accion)).toBe(false);
  });
  it("nutrición puede recetar (decisión D3)", () => {
    expect(rolTienePermiso("nutricion", "receta")).toBe(true);
    expect(rolTienePermiso("nutricion", "diagnostico_conducta_control")).toBe(false);
  });
});
