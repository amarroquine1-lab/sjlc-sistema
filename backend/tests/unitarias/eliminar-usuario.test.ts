import { describe, expect, it } from "vitest";
import { conPermisoEliminar, modoEliminacion, motivoNoEliminar } from "../../src/modulos/usuarios/servicio.js";

const base = { id_usuario: 7, tiene_registros: false, es_ultimo_admin: false, eliminado_el: null };

describe("eliminar usuarios: quién puede eliminarse y de qué manera", () => {
  it("cualquier usuario se puede eliminar, con o sin registros", () => {
    expect(motivoNoEliminar(base, 1)).toBeNull();
    expect(motivoNoEliminar({ ...base, tiene_registros: true }, 1)).toBeNull();
  });
  it("sin registros se borra por completo; con registros se quita del sistema y se conservan", () => {
    expect(modoEliminacion(base)).toBe("borrar");
    expect(modoEliminacion({ ...base, tiene_registros: true })).toBe("quitar");
    expect(conPermisoEliminar({ ...base, tiene_registros: true }, 1)).toMatchObject({ puede_eliminar: true, motivo_no_eliminar: null, modo_eliminacion: "quitar" });
  });
  it("no se elimina a uno mismo (tiene prioridad sobre el último administrador)", () => {
    expect(motivoNoEliminar({ ...base, es_ultimo_admin: true }, 7)).toBe("No puede eliminar su propia cuenta.");
  });
  it("no se elimina al último administrador activo", () => {
    expect(motivoNoEliminar({ ...base, es_ultimo_admin: true }, 1)).toBe("No se puede eliminar al último administrador activo.");
    expect(conPermisoEliminar({ ...base, es_ultimo_admin: true }, 1).puede_eliminar).toBe(false);
  });
  it("un usuario ya eliminado no se elimina otra vez", () => {
    expect(motivoNoEliminar({ ...base, eliminado_el: "2026-10-16T12:00:00Z" }, 1)).toBe("Este usuario ya fue eliminado.");
  });
});
