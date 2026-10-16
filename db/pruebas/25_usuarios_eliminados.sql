-- Migración 025: un usuario con actividad se marca como eliminado (no se borra): queda inactivo, no se modifica ni se reactiva,
-- y su fila se conserva para que su nombre siga en los registros. Todo se revierte al terminar cada caso.

-- Se marca: un administrador elimina a un usuario con actividad; la fila y su nombre se conservan y queda en la bitácora
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xconactividad'); BEGIN
    INSERT INTO pacientes (nombres, apellidos, fecha_nacimiento, sexo, id_usuario) VALUES ('Paciente', 'Registrado', DATE '1990-01-01', 'F', v);
    SET LOCAL ROLE sjlc_app;
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = v AND eliminado_el IS NOT NULL AND NOT activo) THEN RAISE EXCEPTION 'no quedó eliminado'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pacientes p JOIN usuarios u USING (id_usuario) WHERE u.id_usuario = v AND u.nombre_usuario = 'xconactividad') THEN RAISE EXCEPTION 'se perdió el nombre en los registros'; END IF;
    IF NOT EXISTS (SELECT 1 FROM bitacora WHERE accion = 'eliminar' AND entidad = 'usuarios' AND id_registro = v
                      AND id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre_usuario = 'padmin')
                      AND valor_anterior ->> 'eliminado_el' IS NULL AND valor_nuevo ->> 'eliminado_el' IS NOT NULL
                      AND NOT (valor_nuevo ? 'contrasena_hash')) THEN RAISE EXCEPTION 'no quedó en la bitácora como eliminar'; END IF;
END $q$$t$, 'un administrador quita del sistema a un usuario con actividad: la fila queda y se anota en la bitácora', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));

-- No se reactiva ni se modifica: ni la aplicación ni el dueño
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xreactivar'); BEGIN
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    UPDATE usuarios SET activo = true WHERE id_usuario = v; END $q$$t$, '23001', 'un usuario eliminado no se reactiva (ni el dueño)', false, NULL, 'no se puede modificar ni reactivar');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xdeshacer'); BEGIN
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    UPDATE usuarios SET eliminado_el = NULL WHERE id_usuario = v; END $q$$t$, '23001', 'no se puede deshacer la eliminación', false, NULL, 'no se puede modificar ni reactivar');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xnombre'); BEGIN
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    UPDATE usuarios SET nombres = 'Otro' WHERE id_usuario = v; END $q$$t$, '23001', 'un usuario eliminado no cambia de datos', false, NULL);
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xingresa'); BEGIN
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    UPDATE usuarios SET ultimo_ingreso = now(), intentos_fallidos = 0 WHERE id_usuario = v; END $q$$t$, '23001', 'un usuario eliminado no puede registrar ingresos', false, NULL);
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xactivo'); BEGIN
    UPDATE usuarios SET eliminado_el = now() WHERE id_usuario = v; END $q$$t$, '23001', 'un usuario eliminado debe quedar inactivo', false, NULL, 'queda desactivado');
SELECT pg_temp.verificar(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_usuarios_eliminado_inactivo'), 'además, una restricción CHECK exige que un eliminado esté inactivo');

-- Reglas de identidad
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET activo = false, eliminado_el = now() WHERE nombre_usuario = 'sistema'$t$, '23001', 'la cuenta del sistema no se elimina', false, NULL, 'sistema');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xyomismo', 'administrador'); BEGIN
    PERFORM set_config('sjlc.id_usuario', v::text, true);
    SET LOCAL ROLE sjlc_app; UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v; END $q$$t$, '23001', 'nadie se elimina a sí mismo', false, NULL, 'propia cuenta');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xultimoadmin', 'administrador'); BEGIN
    UPDATE usuarios SET activo = false WHERE id_usuario <> v AND id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'administrador') AND nombre_usuario <> 'sistema';
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v; END $q$$t$, '23001', 'no se elimina al último administrador activo', false, NULL, 'último administrador');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xnoadmin'); BEGIN
    SET LOCAL ROLE sjlc_app; UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v; END $q$$t$, '42501', 'quien no es administrador no elimina usuarios', false, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'precepcion'));

-- El nombre de usuario sigue reservado y el nombre sigue saliendo en los registros
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE v integer := pg_temp.nuevo_usuario('xreservado'); BEGIN
    UPDATE usuarios SET activo = false, eliminado_el = now() WHERE id_usuario = v;
    PERFORM pg_temp.nuevo_usuario('xreservado'); END $q$$t$, '23505', 'el nombre de usuario de un eliminado no se reutiliza');
-- El borrado completo sigue limitado a quien no tiene actividad
SELECT pg_temp.debe_fallar($t$DELETE FROM usuarios WHERE nombre_usuario = 'precepcion'$t$, '23001', 'quien tiene actividad no se borra por completo', false, NULL, 'solo se puede desactivar');
