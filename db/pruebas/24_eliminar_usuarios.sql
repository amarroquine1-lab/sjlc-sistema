-- Migración 024: un usuario solo se elimina si nunca tuvo actividad; la base de datos lo valida además del backend.
-- Contexto de las sentencias: id_usuario = quien opera (como lo fija el backend). Todo se revierte al terminar cada caso.

SELECT pg_temp.verificar(NOT public.usuario_tiene_registros((SELECT pg_temp.nuevo_usuario('xnuevoa'))), 'un usuario recién creado no tiene registros');
SELECT pg_temp.verificar(public.usuario_tiene_registros(pg_temp.uid('precepcion')), 'un usuario con actividad tiene registros');
SELECT pg_temp.verificar(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'trg_usuarios_bloquear_borrado'), 'ya no existe el bloqueo total de DELETE en usuarios');

-- Se elimina: administrador activo, usuario sin actividad; queda en la bitácora con quién lo hizo y los datos del usuario
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xborrable'); BEGIN
    SET LOCAL ROLE sjlc_app;
    DELETE FROM usuarios WHERE id_usuario = v;
    IF EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = v) THEN RAISE EXCEPTION 'no se eliminó'; END IF;
    IF NOT EXISTS (SELECT 1 FROM bitacora WHERE accion = 'eliminar' AND entidad = 'usuarios' AND id_registro = v
                      AND id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'padmin')
                      AND valor_anterior ->> 'nombre_usuario' = 'xborrable' AND NOT (valor_anterior ? 'contrasena_hash')
                      AND valor_nuevo IS NULL) THEN RAISE EXCEPTION 'no quedó en la bitácora'; END IF;
END $q$$t$, 'un administrador elimina a un usuario sin actividad y queda en la bitácora (sin el hash)', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));

-- Con actividad no se elimina (ni como dueño ni como aplicación)
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xingreso'); BEGIN
    UPDATE usuarios SET ultimo_ingreso = now() WHERE id_usuario = v;
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '23001', 'quien ya ingresó no se elimina', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'), 'solo se puede desactivar');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xpaciente'); BEGIN
    INSERT INTO pacientes (nombres, apellidos, fecha_nacimiento, sexo, id_usuario) VALUES ('Prueba', 'Borrado', DATE '1990-01-01', 'F', v);
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '23001', 'quien registró un paciente no se elimina', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'), 'solo se puede desactivar');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xbitacora'); BEGIN
    INSERT INTO bitacora (id_usuario, accion, entidad, detalle) VALUES (v, 'inicio_sesion_fallido', 'usuarios', 'intento 1');
    DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '23001', 'quien tiene eventos en la bitácora no se elimina (ni el dueño)', false, NULL, 'solo se puede desactivar');
SELECT pg_temp.debe_fallar($t$DELETE FROM usuarios WHERE nombre_usuario = 'precepcion'$t$, '23001', 'el dueño tampoco puede eliminar a quien tiene actividad', false, NULL, 'solo se puede desactivar');

-- Reglas de identidad
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xyo', 'administrador'); BEGIN
    PERFORM set_config('sjlc.id_usuario', v::text, true);
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '23001', 'nadie se elimina a sí mismo', false, NULL, 'propia cuenta');
SELECT pg_temp.debe_fallar($t$DELETE FROM usuarios WHERE nombre_usuario = 'sistema'$t$, '23001', 'la cuenta del sistema no se elimina', false, NULL, 'sistema');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xultimo', 'administrador'); BEGIN
    UPDATE usuarios SET activo = false WHERE id_usuario <> v AND id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'administrador') AND nombre_usuario <> 'sistema';
    DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '23001', 'no se elimina al último administrador activo', false, NULL, 'último administrador');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xinactivo', 'administrador'); BEGIN
    UPDATE usuarios SET activo = false WHERE id_usuario = v;
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, 'un administrador desactivado sin actividad sí se puede eliminar', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));

-- Quién opera
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xotro'); BEGIN
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '42501', 'un usuario que no es administrador no elimina usuarios', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'precepcion'), 'administrador');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xsinactor'); BEGIN
    SET LOCAL ROLE sjlc_app; DELETE FROM usuarios WHERE id_usuario = v; END $q$$t$, '42501', 'la aplicación no elimina usuarios sin identificar quién opera', false, NULL);
SELECT pg_temp.debe_fallar($t$TRUNCATE usuarios CASCADE$t$, '23001', 'vaciar usuarios sigue bloqueado');
SELECT pg_temp.debe_fallar($t$DELETE FROM pacientes$t$, '42501', 'la aplicación sigue sin poder borrar pacientes', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
