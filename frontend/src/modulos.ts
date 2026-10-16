import type { Rol } from "./api/tipos";

// Módulos de la aplicación. Cada fase marca como disponibles los suyos.
export interface Modulo { id: string; titulo: string; descripcion: string; ruta: string; roles: Rol[]; disponible: boolean; grupo: "area" | "consulta" | "administracion" }

const TODOS: Rol[] = ["administrador", "recepcion", "signos", "doctor", "nutricion", "vacunacion", "farmacia"];

export const MODULOS: Modulo[] = [
  { grupo: "area", id: "recepcion", titulo: "Recepción", descripcion: "Registrar pacientes, abrir atenciones y buscar expedientes.", ruta: "/recepcion", roles: ["administrador", "recepcion"], disponible: true },
  { grupo: "area", id: "signos", titulo: "Signos vitales", descripcion: "Cola de espera y registro de signos.", ruta: "/signos", roles: ["administrador", "signos"], disponible: true },
  { grupo: "area", id: "doctor", titulo: "Consulta médica", descripcion: "Cola de pacientes, consulta, receta y próximo control.", ruta: "/doctor", roles: ["administrador", "doctor"], disponible: true },
  { grupo: "area", id: "nutricion", titulo: "Nutrición", descripcion: "Evaluación nutricional y suplementos.", ruta: "/nutricion", roles: ["administrador", "nutricion"], disponible: true },
  { grupo: "area", id: "vacunacion", titulo: "Vacunación", descripcion: "Registro de vacunas y esquema.", ruta: "/vacunacion", roles: ["administrador", "vacunacion"], disponible: true },
  { grupo: "area", id: "farmacia", titulo: "Farmacia", descripcion: "Recetas pendientes y entrega de medicamentos.", ruta: "/farmacia", roles: ["administrador", "farmacia"], disponible: true },
  { grupo: "consulta", id: "historial", titulo: "Historial del paciente", descripcion: "Todas las visitas y pendientes de un paciente.", ruta: "/historial", roles: TODOS, disponible: true },
  { grupo: "administracion", id: "usuarios", titulo: "Usuarios", descripcion: "Crear usuarios, restablecer contraseñas y desbloquear cuentas.", ruta: "/administracion/usuarios", roles: ["administrador"], disponible: true },
  { grupo: "administracion", id: "bitacora", titulo: "Bitácora", descripcion: "Quién hizo qué y cuándo, con filtros.", ruta: "/administracion/bitacora", roles: ["administrador"], disponible: true },
  { grupo: "administracion", id: "colas", titulo: "Estado de las colas", descripcion: "Pacientes esperando y en atención en cada área.", ruta: "/administracion/colas", roles: ["administrador"], disponible: true },
  { grupo: "administracion", id: "reportes", titulo: "Reportes", descripcion: "Reportes imprimibles y tiempos de espera.", ruta: "/reportes", roles: ["administrador"], disponible: true },
];

export const modulosDe = (rol: Rol): Modulo[] => MODULOS.filter((m) => m.roles.includes(rol));
