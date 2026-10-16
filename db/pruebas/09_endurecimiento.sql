-- Migración 009: bitácora directa, usuarios, reaperturas, uniones y horas futuras.
-- Actores (ids como texto, para fijar sjlc.id_usuario como lo hace el backend).
\set adm '(SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = ''padmin'')'
\set rec '(SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = ''precepcion'')'

-- S-11: la exención depende de ser dueño de la tabla, no del nombre del rol
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN
    CREATE ROLE zrol_prueba LOGIN;
    GRANT USAGE ON SCHEMA public TO zrol_prueba;
    GRANT INSERT ON pacientes TO zrol_prueba; GRANT SELECT ON usuarios TO zrol_prueba;
    GRANT INSERT ON bitacora TO zrol_prueba; GRANT EXECUTE ON FUNCTION public.formatear_correlativo(text, bigint) TO zrol_prueba; GRANT EXECUTE ON FUNCTION public.unaccent_inmutable(text) TO zrol_prueba; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO zrol_prueba;
    SET LOCAL ROLE zrol_prueba;
    INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',1);
    END $q$$t$, 'P0001', 'S-11: otro rol con LOGIN que escribe sin usuario de sesión es rechazado', false, NULL, 'no se identificó al usuario');
SELECT pg_temp.debe_pasar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',pg_temp.uid('precepcion'))$t$, 'S-11: el dueño de la tabla sigue exento (migraciones y seeds)');

-- S-01: inserción directa en bitácora
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'editar','pacientes')$t$, '42501', 'S-01: acción "editar" directa se rechaza', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'crear','pacientes')$t$, '42501', 'S-01: acción "crear" directa se rechaza', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'eliminar','pacientes')$t$, '42501', 'S-01: acción "eliminar" directa se rechaza', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'accion_inventada','usuarios')$t$, '42501', 'S-01: acción fuera de la lista se rechaza', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='padmin'),'inicio_sesion','usuarios')$t$, '42501', 'S-01: id_usuario distinto del de la sesión (suplantación) se rechaza', true, :rec);
SELECT pg_temp.debe_pasar($t$INSERT INTO bitacora (id_usuario,accion,entidad,id_registro,direccion_ip) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'inicio_sesion','usuarios',1,'203.0.113.7')$t$, 'S-01: acción permitida con el usuario de la sesión se acepta', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'inicio_sesion','usuarios')$t$, '42501', 'S-01: sin sjlc.id_usuario una acción permitida se rechaza', true, NULL);
SELECT pg_temp.debe_pasar($t$INSERT INTO bitacora (id_usuario,nombre_usuario_intentado,accion,entidad,direccion_ip) VALUES (NULL,'inexistente','inicio_sesion_fallido','usuarios','203.0.113.8')$t$, 'S-01: ingreso fallido con id nulo y nombre intentado se acepta', true, NULL);
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES (NULL,'inicio_sesion_fallido','usuarios')$t$, '42501', 'S-01: ingreso fallido sin nombre intentado se rechaza', true, NULL);
SELECT pg_temp.debe_pasar($t$INSERT INTO bitacora (id_usuario,accion,entidad,detalle) VALUES (NULL,'acceso_denegado','api','sin sesión')$t$, 'S-01: acceso_denegado sin sesión se acepta', true, NULL);
SELECT pg_temp.debe_pasar($t$INSERT INTO bitacora (id_usuario,accion,entidad) VALUES (NULL,'editar','pacientes')$t$, 'el dueño puede insertar cualquier acción (migraciones y seeds)');

-- S-02: usuarios
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre_rol='administrador') WHERE nombre_usuario = 'precepcion'$t$, '42501', 'S-02: recepción no puede cambiar su propio rol', true, :rec);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre_rol='administrador') WHERE nombre_usuario = 'psignos'$t$, '42501', 'S-02: recepción no puede cambiar el rol de otro', true, :rec);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET activo = false WHERE nombre_usuario = 'psignos'$t$, '42501', 'S-02: recepción no puede desactivar usuarios', true, :rec);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET contrasena_hash = 'x' WHERE nombre_usuario = 'psignos'$t$, '42501', 'S-02: recepción no puede cambiar la contraseña de otro', true, :rec);
SELECT pg_temp.debe_fallar($t$INSERT INTO usuarios (nombre_usuario,nombres,apellidos,id_rol,contrasena_hash) VALUES ('zintruso','A','B',(SELECT id_rol FROM roles WHERE nombre_rol='administrador'),'x')$t$, '42501', 'S-02: recepción no puede crear usuarios', true, :rec);
SELECT pg_temp.debe_pasar($t$INSERT INTO usuarios (nombre_usuario,nombres,apellidos,id_rol,contrasena_hash) VALUES ('zcreado','A','B',(SELECT id_rol FROM roles WHERE nombre_rol='doctor'),'x')$t$, 'S-02: un administrador activo puede crear usuarios', true, :adm);
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre_rol='doctor'), nombres = 'Cambiado' WHERE nombre_usuario = 'psignos'$t$, 'S-02: un administrador puede cambiar rol y nombres de otro', true, :adm);
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET activo = false WHERE nombre_usuario = 'psignos'$t$, 'S-02: un administrador puede desactivar a otro usuario', true, :adm);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre_rol='doctor') WHERE nombre_usuario = 'padmin'$t$, '42501', 'S-02: un administrador no puede quitarse su propio rol', true, :adm);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET activo = false WHERE nombre_usuario = 'padmin'$t$, '42501', 'S-02: un administrador no puede desactivarse', true, :adm);
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN
    UPDATE usuarios SET activo = false WHERE nombre_usuario IN ('aprueba','bprueba');
    UPDATE usuarios SET activo = false WHERE nombre_usuario = 'padmin'; END $q$$t$, '42501', 'S-02: nadie deja el sistema sin administradores activos', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='aprueba'));
SELECT pg_temp.debe_pasar($t$DO $q$ BEGIN UPDATE usuarios SET debe_cambiar_contrasena = true WHERE nombre_usuario = 'precepcion'; SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE usuarios SET contrasena_hash = 'nuevo-hash', debe_cambiar_contrasena = false WHERE nombre_usuario = 'precepcion'; END $q$$t$ , 'S-02: el propio usuario cambia su contraseña y quita la obligación');
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET contrasena_hash = 'nuevo-hash', debe_cambiar_contrasena = false WHERE nombre_usuario = 'precepcion'$t$, 'S-02: el propio usuario cambia su contraseña y quita la obligación', true, :rec);
UPDATE usuarios SET debe_cambiar_contrasena = true WHERE nombre_usuario IN ('precepcion', 'psignos');
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET debe_cambiar_contrasena = false WHERE nombre_usuario = 'precepcion'$t$, '42501', 'S-02: no se quita la obligación de cambiar sin cambiar el hash', true, :rec);
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET intentos_fallidos = 3, bloqueado_hasta = now() + interval '15 minutes', ultimo_ingreso = now() WHERE nombre_usuario = 'precepcion'$t$, 'S-02: el propio usuario fija intentos, bloqueo y último ingreso (flujo de ingreso)', true, :rec);
UPDATE usuarios SET intentos_fallidos = 3, bloqueado_hasta = now() + interval '15 minutes' WHERE nombre_usuario = 'psignos';
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE nombre_usuario = 'psignos'$t$, '42501', 'S-02: recepción no desbloquea a otro usuario', true, :rec);
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE nombre_usuario = 'psignos'$t$, 'S-02: un administrador desbloquea a otro usuario', true, :adm);
SELECT pg_temp.debe_fallar($t$UPDATE usuarios SET intentos_fallidos = 1 WHERE nombre_usuario = 'psignos'$t$, '42501', 'S-02: sin sesión (sin sjlc.id_usuario) no se modifica usuarios', true, NULL);
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET nombres = 'Dueño' WHERE nombre_usuario = 'psignos'$t$, 'S-02: el dueño (migraciones y seeds) queda exento');
-- Ruido de bitácora
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE n1 integer; n2 integer; BEGIN
    SELECT count(*) INTO n1 FROM bitacora WHERE entidad = 'usuarios' AND accion = 'editar';
    UPDATE usuarios SET ultimo_ingreso = now(), intentos_fallidos = 0 WHERE nombre_usuario = 'psignos';
    SELECT count(*) INTO n2 FROM bitacora WHERE entidad = 'usuarios' AND accion = 'editar';
    IF n2 <> n1 THEN RAISE EXCEPTION 'un UPDATE de ultimo_ingreso e intentos no debe anotarse (% -> %)', n1, n2; END IF;
    UPDATE usuarios SET nombres = 'Otro' WHERE nombre_usuario = 'psignos';
    SELECT count(*) INTO n1 FROM bitacora WHERE entidad = 'usuarios' AND accion = 'editar';
    IF n1 <> n2 + 1 THEN RAISE EXCEPTION 'cambiar nombres sí debe anotarse'; END IF; END $q$$t$, 'bitácora: ultimo_ingreso e intentos no se anotan, nombres sí');

-- S-10
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente(), 'finalizada'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE atenciones SET estado = 'en_espera', fecha_hora_cierre = NULL WHERE id_atencion = a; END $q$$t$, '23001', 'S-10: una atención finalizada no se reabre');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente(), 'se_retiro'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE atenciones SET estado = 'finalizada' WHERE id_atencion = a; END $q$$t$, '23001', 'S-10: una atención que se retiró no pasa a otro estado final');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente(), 'en_espera'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE atenciones SET estado = 'en_atencion' WHERE id_atencion = a;
    UPDATE atenciones SET estado = 'finalizada', fecha_hora_cierre = now() WHERE id_atencion = a; END $q$$t$, 'S-10: una atención abierta avanza y se cierra normalmente');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    SET CONSTRAINTS ALL IMMEDIATE;
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b; END $q$$t$, '23001', 'S-10: id_paciente_principal sin unión registrada se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    SET CONSTRAINTS ALL IMMEDIATE;
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b; END $q$$t$, 'S-10: id_paciente_principal con la unión registrada se acepta');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); c integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b;
    UPDATE pacientes SET id_paciente_principal = c WHERE id_paciente = b; END $q$$t$, '23001', 'S-10: la unión no se cambia después');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario) VALUES (a,(SELECT min(id_tipo_atencion) FROM tipos_atencion),'en_espera',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'));
    UPDATE atenciones SET fecha_hora_cierre = now() + interval '2 hours', estado = 'finalizada' WHERE id_paciente = a; END $q$$t$, '23001', 'S-10: cierre de atención en el futuro se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (a,3,now() + interval '3 hours',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='pdoctora')); END $q$$t$, '23001', 'S-10: hora de inicio de un recorrido en el futuro se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); u integer := pg_temp.nuevo_usuario('ztoler'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (a,3,now() + interval '30 seconds',u); END $q$$t$, 'S-10: hasta 1 minuto de tolerancia en las horas se acepta');
SELECT pg_temp.verificar(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_bitacora_ip_fallidos'), 'índice de intentos fallidos por IP existe');
SELECT pg_temp.cerrar();
