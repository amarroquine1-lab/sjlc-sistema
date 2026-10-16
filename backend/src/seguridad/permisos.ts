// Matriz de permisos del proyecto (sección 8 de la especificación). El administrador siempre tiene todos.
export type Rol = "administrador" | "recepcion" | "signos" | "doctor" | "nutricion" | "vacunacion" | "farmacia";

export const ROLES: Rol[] = ["administrador", "recepcion", "signos", "doctor", "nutricion", "vacunacion", "farmacia"];

const TODOS_VEN: Rol[] = ["administrador", "recepcion", "signos", "doctor", "nutricion", "vacunacion", "farmacia"];

export const PERMISOS = {
  // Pacientes
  registrar_paciente: ["administrador", "recepcion"],
  ver_paciente: TODOS_VEN,
  abrir_atencion: ["administrador", "recepcion"],
  unir_pacientes: ["administrador", "recepcion"],
  marcar_se_retiro: ["administrador", "recepcion"],
  // Áreas clínicas
  registrar_signos: ["administrador", "signos"],
  diagnostico_conducta_control: ["administrador", "doctor"],
  receta: ["administrador", "doctor", "nutricion"],
  // Cada área que atiende puede dejar un pendiente para la próxima visita (sección 10.2).
  proximo_control: ["administrador", "doctor", "nutricion", "vacunacion"],
  evaluacion_nutricional: ["administrador", "nutricion"],
  registro_vacunas: ["administrador", "vacunacion"],
  entrega_medicamentos: ["administrador", "farmacia"],
  ver_historial: TODOS_VEN,
  // Colas de atención por área (el área se valida además en el servicio)
  atender_cola: ["administrador", "signos", "doctor", "nutricion", "vacunacion", "farmacia"],
  atender_signos: ["administrador", "signos"],
  atender_doctor: ["administrador", "doctor"],
  atender_nutricion: ["administrador", "nutricion"],
  atender_vacunacion: ["administrador", "vacunacion"],
  atender_farmacia: ["administrador", "farmacia"],
  // Administración
  "usuarios.administrar": ["administrador"],
  "roles.listar": ["administrador"],
  administracion: ["administrador"],
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof PERMISOS;

export function rolTienePermiso(rol: string, accion: Accion): boolean {
  return (PERMISOS[accion] as readonly string[]).includes(rol);
}
