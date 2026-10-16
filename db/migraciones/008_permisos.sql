-- 008: privilegios mínimos del rol de la aplicación (sjlc_app).
-- Nunca DELETE (salvo pacientes_encargados), nunca TRUNCATE ni DDL.
-- INSERT y UPDATE se conceden por columna: la aplicación no puede fijar ids,
-- códigos correlativos, fechas de creación ni reescribir registros clínicos.
-- Toda tabla nueva queda cerrada hasta que su migración conceda lo necesario.

-- Base de datos y esquema ------------------------------------------------------

DO $$
BEGIN
    EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO sjlc_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO sjlc_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

-- Funciones propias: solo la aplicación las ejecuta. Los triggers no necesitan EXECUTE.
REVOKE EXECUTE ON FUNCTION public.unaccent_inmutable(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.formatear_correlativo(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bloquear_borrado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.permitir_solo_desactivar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bloquear_modificacion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_bitacora() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unaccent_inmutable(text) TO sjlc_app;
GRANT EXECUTE ON FUNCTION public.formatear_correlativo(text, bigint) TO sjlc_app;

-- Objetos futuros creados por el dueño: sin privilegios para nadie por omisión.
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Secuencias: nextval para los correlativos e identidades.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sjlc_app;

-- Catálogos: solo lectura (se cargan por migración o seed) ------------------------

GRANT SELECT ON areas, roles, tipos_atencion, pueblos, comunidades_linguisticas,
                departamentos, municipios, presentaciones, medicamentos
      TO sjlc_app;

-- Seguridad -----------------------------------------------------------------------

GRANT SELECT ON usuarios TO sjlc_app;
GRANT INSERT (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash,
              debe_cambiar_contrasena, activo)
      ON usuarios TO sjlc_app;
GRANT UPDATE (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash,
              debe_cambiar_contrasena, intentos_fallidos, bloqueado_hasta, activo, ultimo_ingreso)
      ON usuarios TO sjlc_app;

-- Bitácora: solo agregar; la hora la pone la base.
GRANT SELECT ON bitacora TO sjlc_app;
GRANT INSERT (id_usuario, nombre_usuario_intentado, accion, entidad, id_registro,
              direccion_ip, valor_anterior, valor_nuevo, detalle)
      ON bitacora TO sjlc_app;

-- Pacientes -----------------------------------------------------------------------

GRANT SELECT ON pacientes TO sjlc_app;
GRANT INSERT (nombres, apellidos, fecha_nacimiento, edad_aproximada_anios, sexo, cui,
              telefono, direccion, id_municipio_residencia, id_municipio_nacimiento,
              id_pueblo, id_comunidad_linguistica, numero_registro_libro,
              datos_incompletos, id_usuario)
      ON pacientes TO sjlc_app;
GRANT UPDATE (nombres, apellidos, fecha_nacimiento, edad_aproximada_anios, sexo, cui,
              telefono, direccion, id_municipio_residencia, id_municipio_nacimiento,
              id_pueblo, id_comunidad_linguistica, numero_registro_libro,
              datos_incompletos, id_paciente_principal)
      ON pacientes TO sjlc_app;

GRANT SELECT ON encargados TO sjlc_app;
GRANT INSERT (nombres, apellidos, dpi, telefono) ON encargados TO sjlc_app;
GRANT UPDATE (nombres, apellidos, dpi, telefono) ON encargados TO sjlc_app;

-- Única tabla con DELETE.
GRANT SELECT, DELETE ON pacientes_encargados TO sjlc_app;
GRANT INSERT (id_paciente, id_encargado, parentesco, es_principal) ON pacientes_encargados TO sjlc_app;
GRANT UPDATE (id_paciente, parentesco, es_principal) ON pacientes_encargados TO sjlc_app;

GRANT SELECT ON uniones_pacientes TO sjlc_app;
GRANT INSERT (id_paciente, id_paciente_unido, motivo, datos_unido, id_usuario)
      ON uniones_pacientes TO sjlc_app;

-- Atención ------------------------------------------------------------------------

-- La hora de llegada la pone la base (no se puede adelantar ni atrasar).
GRANT SELECT ON atenciones TO sjlc_app;
GRANT INSERT (id_paciente, id_tipo_atencion, estado, id_usuario) ON atenciones TO sjlc_app;
GRANT UPDATE (id_paciente, id_tipo_atencion, estado, fecha_hora_cierre) ON atenciones TO sjlc_app;

-- La hora de entrada a la cola la pone la base.
GRANT SELECT ON recorridos_atencion TO sjlc_app;
GRANT INSERT (id_atencion, id_area, fecha_hora_inicio, fecha_hora_salida, id_usuario)
      ON recorridos_atencion TO sjlc_app;
GRANT UPDATE (fecha_hora_inicio, fecha_hora_salida, id_usuario) ON recorridos_atencion TO sjlc_app;

GRANT SELECT ON proximos_controles TO sjlc_app;
GRANT INSERT (id_paciente, id_atencion, id_area, descripcion, fecha_sugerida, estado, id_usuario)
      ON proximos_controles TO sjlc_app;
GRANT UPDATE (id_paciente, descripcion, fecha_sugerida, estado) ON proximos_controles TO sjlc_app;

-- Clínicas: insertar y, en las versionadas, solo desactivar ----------------------

GRANT SELECT ON signos_vitales TO sjlc_app;
GRANT INSERT (id_atencion, peso_kg, talla_cm, temperatura_c, presion_sistolica,
              presion_diastolica, frecuencia_cardiaca, saturacion_oxigeno,
              hay_signos_peligro, detalle_signos_peligro, id_usuario, corrige_a)
      ON signos_vitales TO sjlc_app;
GRANT UPDATE (vigente) ON signos_vitales TO sjlc_app;

GRANT SELECT ON consultas TO sjlc_app;
GRANT INSERT (id_atencion, id_usuario, tipo_consulta, motivo_consulta, historia_enfermedad,
              semana_gestacion, conducta_tratamiento, problemas_identificados, referido_a,
              corrige_a)
      ON consultas TO sjlc_app;
GRANT UPDATE (vigente) ON consultas TO sjlc_app;

GRANT SELECT ON diagnosticos_consulta TO sjlc_app;
GRANT INSERT (id_consulta, descripcion_diagnostico, codigo_cie10) ON diagnosticos_consulta TO sjlc_app;

GRANT SELECT ON recetas TO sjlc_app;
GRANT INSERT (id_atencion, id_area, id_usuario, corrige_a) ON recetas TO sjlc_app;
GRANT UPDATE (vigente) ON recetas TO sjlc_app;

GRANT SELECT ON recetas_detalle TO sjlc_app;
GRANT INSERT (id_receta, id_medicamento, cantidad_recetada, indicaciones) ON recetas_detalle TO sjlc_app;
