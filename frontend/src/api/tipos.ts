export interface Yo {
  id_usuario: number; nombre_usuario: string; nombres: string; apellidos: string;
  rol: Rol; area: string | null; debe_cambiar_contrasena: boolean; vence_por_inactividad_en: string | null;
}
export type Rol = "administrador" | "recepcion" | "signos" | "doctor" | "nutricion" | "vacunacion" | "farmacia";

export interface Edad { anios: number; meses: number; dias: number; texto: string }
export interface Encargado { id_encargado: number; nombres: string; apellidos: string; dpi: string | null; telefono: string | null; parentesco: string; es_principal: boolean }
export interface AtencionAbierta { id_atencion: number; numero_atencion: string; estado: string; tipo: string; es_emergencia: boolean; area_actual: string | null }
export interface Pendiente { id_proximo_control: number; descripcion: string; fecha_sugerida: string | null; area: string }
export interface Paciente {
  id_paciente: number; codigo_paciente: string; nombres: string | null; apellidos: string | null; fecha_nacimiento: string | null; edad: Edad | null;
  edad_aproximada_anios: number | null; sexo: "F" | "M"; cui: string | null; telefono: string | null; direccion: string | null;
  id_municipio_residencia: number | null; municipio_residencia: string | null; zona_residencia: number | null; id_colonia_sector: number | null;
  colonia_sector: string | null; id_pueblo: number | null; id_comunidad_linguistica: number | null; numero_registro_libro: string | null;
  datos_incompletos: boolean; es_menor: boolean; atencion_abierta: AtencionAbierta | null; encargados: Encargado[]; pendientes: Pendiente[];
}
export interface TipoAtencion { id_tipo_atencion: number; nombre_tipo_atencion: string; es_emergencia: boolean }
export interface AtencionFila {
  id_atencion: number; numero_atencion: string; estado: string; tipo: string; es_emergencia: boolean; codigo_paciente: string;
  nombres: string | null; apellidos: string | null; area_actual: string | null; llegada_texto: string;
}
export interface Ticket { centro: string; codigo_paciente: string; numero_atencion: string; fecha_hora: string; tipo: string; es_emergencia: boolean; nombre: string; codigo_barras: string }
export interface CatalogosFormulario {
  departamentos: { id_departamento: number; nombre_departamento: string }[];
  pueblos: { id_pueblo: number; nombre_pueblo: string }[];
  comunidades_linguisticas: { id_comunidad_linguistica: number; nombre_comunidad_linguistica: string }[];
  colonias_sectores: { id_colonia_sector: number; id_municipio: number; zona: number; nombre_colonia_sector: string }[];
}
export interface Municipio { id_municipio: number; id_departamento: number; nombre_municipio: string; nombre_departamento: string }

export interface FilaCola {
  id_recorrido_atencion: number; id_atencion: number; en_atencion: boolean; id_usuario: number | null; atiende: string | null; numero_atencion: string;
  estado: string; tipo: string; es_emergencia: boolean; id_paciente: number; codigo_paciente: string; nombres: string | null; apellidos: string | null;
  sexo: "F" | "M"; datos_incompletos: boolean; espera_minutos: number; entrada_hora: string; pendientes: number; edad: string | null; motivo_envio: string | null;
}
export interface Cola { area: string; clave: string; en_espera: FilaCola[]; en_atencion: FilaCola[]; mi_atencion: FilaCola | null;
  mi_atencion_otra_area?: { numero_atencion: string; area: string; clave: string | null; paciente: string } | null }
export interface OpcionEnvio { destino: string; etiqueta: string; sugerido: boolean; requiere_receta?: boolean }
export interface Signos {
  id_signo_vital: number; peso_lb: number | null; talla_cm: number | null; temperatura_c: number | null; presion_sistolica: number | null;
  presion_diastolica: number | null; frecuencia_cardiaca: number | null; saturacion_oxigeno: number | null; hay_signos_peligro: boolean;
  detalle_signos_peligro: string | null; registrado: string; registrado_por: string; imc: { imc: number; categoria: string | null } | null;
}
export interface PanelAtencion {
  atencion: { id_atencion: number; numero_atencion: string; estado: string; tipo: string; es_emergencia: boolean; area: string; motivo_envio?: string | null };
  paciente: Paciente; signos: Signos | null; opciones_envio: OpcionEnvio[]; clinico: Clinico | null; especifico: Especifico | null;
}

export interface LineaRecetaVista { id_receta: number; area: string; medicamento: string; presentacion: string; cantidad_recetada: number; indicaciones: string }
export interface ConsultaVista {
  id_consulta: number; tipo_consulta: "primera" | "reconsulta" | "control"; motivo_consulta: string; historia_enfermedad: string | null; semana_gestacion: number | null;
  conducta_tratamiento: string | null; problemas_identificados: string | null; referido_a: string | null; registrada: string; registrada_por: string;
  diagnosticos: { descripcion_diagnostico: string; codigo_cie10: string | null }[];
}
export interface ControlVista { id_proximo_control: number; area: string; descripcion: string; fecha_sugerida: string | null; estado: string }
export interface HistorialResumido { numero_atencion: string; fecha: string; tipo: string; estado: string; motivo_consulta: string | null; conducta_tratamiento: string | null; diagnosticos: string }
export interface Clinico { consulta: ConsultaVista | null; receta: LineaRecetaVista[]; proximos_controles: ControlVista[]; historial_resumido: HistorialResumido[] }
export interface MedicamentoCatalogo { id_medicamento: number; nombre_medicamento: string; presentacion: string; concentracion: string | null }
export interface EvaluacionVista { id_evaluacion_nutricional: number; diagnostico_nutricional: string; codigo_cie10: string | null; observaciones: string | null; registrada: string; registrada_por: string }
export interface VacunaAplicadaVista { id_vacuna_aplicada: number; id_vacuna: number | null; nombre_vacuna: string; numero_dosis: number; lote: string | null; fecha_aplicacion: string; fecha_iso: string; aplicada_por: string; numero_atencion?: string }
export interface VacunaCatalogo { id_vacuna: number; nombre_vacuna: string; dosis_totales: number | null }
export interface Especifico { evaluacion?: EvaluacionVista | null; aplicadas?: VacunaAplicadaVista[]; esquema_previo?: VacunaAplicadaVista[]; proximos_controles?: ControlVista[]; renglones?: RenglonFarmacia[]; pendiente?: boolean }
export interface RenglonFarmacia {
  id_receta_detalle: number; id_receta: number; receta_de: string; responsable_consulta: string; medicamento: string; presentacion: string;
  cantidad_recetada: number; indicaciones: string; numero_orden: number | null; cantidad_entregada: number | null; cantidad_no_entregada: number | null;
  observacion: string | null; recibido_por: string | null; entregada_el: string | null;
}
export interface TramoHistorial { area: string; entrada: string; inicio: string | null; salida: string | null; atendio: string | null; espera_minutos: number | null; motivo_envio: string | null }
export interface AtencionHistorial {
  id_atencion: number; numero_atencion: string; estado: string; llegada: string; cierre: string | null; tipo: string; es_emergencia: boolean; abierta_por: string;
  recorrido: TramoHistorial[];
  signos: { peso_lb: number | null; talla_cm: number | null; temperatura_c: number | null; presion_sistolica: number | null; presion_diastolica: number | null; frecuencia_cardiaca: number | null; saturacion_oxigeno: number | null; hay_signos_peligro: boolean; detalle_signos_peligro: string | null; registrado_por: string } | null;
  consulta: { tipo_consulta: string; motivo_consulta: string; historia_enfermedad: string | null; conducta_tratamiento: string | null; problemas_identificados: string | null; referido_a: string | null; atendio: string; diagnosticos: { descripcion: string; cie10: string | null }[] } | null;
  receta: { receta_de: string; medicamento: string; presentacion: string; cantidad_recetada: number; indicaciones: string; cantidad_entregada: number | null; cantidad_no_entregada: number | null; observacion: string | null }[];
  evaluacion_nutricional: { diagnostico_nutricional: string; codigo_cie10: string | null; observaciones: string | null } | null;
  vacunas: { nombre_vacuna: string; numero_dosis: number; lote: string | null; fecha_aplicacion: string }[];
  proximos_controles: { area: string; descripcion: string; fecha_sugerida: string | null; estado: string }[];
}
export interface HistorialPaciente { paciente: Paciente; atenciones: AtencionHistorial[]; total: number; pagina: number; por_pagina: number }
export interface UsuarioFila { id_usuario: number; nombre_usuario: string; nombres: string; apellidos: string; id_rol: number; rol: string; area: string | null; activo: boolean; debe_cambiar_contrasena: boolean; intentos_fallidos: number; bloqueado_hasta: string | null; ultimo_ingreso: string | null; tiene_registros: boolean; es_ultimo_admin: boolean; puede_eliminar: boolean; motivo_no_eliminar: string | null; modo_eliminacion: "borrar" | "quitar"; eliminado_el: string | null }
export interface FilaBitacora { id_bitacora: number; fecha_hora: string; usuario: string | null; accion: string; entidad: string; id_registro: number | null; direccion_ip: string | null; detalle: string | null }
export interface EstadoColas { areas: { area: string; en_espera: number; en_atencion: number; espera_maxima_minutos: number; atendiendo: string }[]; atenciones_abiertas: number; sesiones_activas: number }
