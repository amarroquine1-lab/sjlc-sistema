-- Rol de la aplicación (sjlc_app): privilegios mínimos y bitácora obligatoria.
-- Cada sentencia corre con SET LOCAL ROLE sjlc_app; id_usuario se fija como lo haría el backend.
SELECT pg_temp.debe_pasar('SELECT count(*) FROM pacientes', 'sjlc_app puede leer pacientes', true);
SELECT pg_temp.debe_pasar('SELECT count(*) FROM municipios', 'sjlc_app puede leer catálogos', true);
SELECT pg_temp.debe_fallar('INSERT INTO areas (nombre_area) VALUES (''x'')', '42501', 'sjlc_app no puede escribir en catálogos', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('DELETE FROM pacientes', '42501', 'sjlc_app no puede borrar pacientes (permiso)', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('DELETE FROM signos_vitales', '42501', 'sjlc_app no puede borrar signos vitales (permiso)', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('DELETE FROM bitacora', '42501', 'sjlc_app no puede borrar la bitácora', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('TRUNCATE pacientes', '42501', 'sjlc_app no puede vaciar tablas', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('DROP TABLE pacientes CASCADE', '42501', 'sjlc_app no puede eliminar tablas', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('CREATE TABLE intruso (x integer)', '42501', 'sjlc_app no puede crear tablas', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('ALTER TABLE pacientes ADD COLUMN x integer', '42501', 'sjlc_app no puede alterar tablas', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('CREATE FUNCTION public.intruso() RETURNS integer LANGUAGE sql AS ''SELECT 1''', '42501', 'sjlc_app no puede crear funciones en public', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar('CREATE ROLE intruso', '42501', 'sjlc_app no puede crear roles', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
-- SET ROLE no se prueba aquí (se evalúa contra el usuario de la sesión, que es el dueño): lo hace probar-bd.sh con un inicio de sesión real.
SELECT pg_temp.verificar(NOT pg_has_role('sjlc_app', 'pg_monitor', 'MEMBER') AND NOT pg_has_role('sjlc_app', session_user, 'MEMBER'), 'sjlc_app no es miembro de ningún rol con privilegios');
-- Escrituras sin y con usuario de sesión
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'))$t$,
    'P0001', 'escribir sin sjlc.id_usuario se rechaza', true, NULL, 'no se identificó al usuario');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'))$t$,
    'P0001', 'escribir con sjlc.id_usuario no numérico se rechaza', true, 'abc', 'no se identificó al usuario');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'))$t$,
    'P0001', 'escribir con sjlc.id_usuario vacío se rechaza', true, '', 'no se identificó al usuario');
SELECT pg_temp.debe_pasar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','F',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'))$t$,
    'escribir con sjlc.id_usuario numérico se acepta', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'));
-- Columnas que la aplicación no puede fijar
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (id_paciente,nombres,apellidos,fecha_nacimiento,sexo,id_usuario) OVERRIDING SYSTEM VALUE VALUES (999999,'A','B','1990-01-01','F',1)$t$, '42501', 'sjlc_app no puede fijar id_paciente', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (codigo_paciente,nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('SJLC-000999','A','B','1990-01-01','F',1)$t$, '42501', 'sjlc_app no puede fijar el código de paciente', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$UPDATE pacientes SET codigo_paciente = 'SJLC-000999' WHERE id_paciente = (SELECT min(id_paciente) FROM pacientes)$t$, '42501', 'sjlc_app no puede cambiar el código de paciente', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$UPDATE pacientes SET id_usuario = 1 WHERE id_paciente = (SELECT min(id_paciente) FROM pacientes)$t$, '42501', 'sjlc_app no puede cambiar quién registró al paciente', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$INSERT INTO atenciones (id_paciente,id_tipo_atencion,fecha_hora_llegada,id_usuario) VALUES ((SELECT min(id_paciente) FROM pacientes),1,now() - interval '5 hours',1)$t$, '42501', 'sjlc_app no puede fijar la hora de llegada', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$INSERT INTO atenciones (numero_atencion,id_paciente,id_tipo_atencion,id_usuario) VALUES ('A-000001',(SELECT min(id_paciente) FROM pacientes),1,1)$t$, '42501', 'sjlc_app no puede fijar el número de atención', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$UPDATE signos_vitales SET peso_kg = 1$t$, '42501', 'sjlc_app no puede modificar datos de signos vitales', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$UPDATE bitacora SET detalle = 'x'$t$, '42501', 'sjlc_app no puede modificar la bitácora', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (id_bitacora,accion,entidad) OVERRIDING SYSTEM VALUE VALUES (1,'x','y')$t$, '42501', 'sjlc_app no puede fijar el id de bitácora', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_fallar($t$INSERT INTO bitacora (fecha_hora,accion,entidad) VALUES (now() - interval '1 year','x','y')$t$, '42501', 'sjlc_app no puede fijar la fecha de la bitácora', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_pasar($t$INSERT INTO bitacora (id_usuario,nombre_usuario_intentado,accion,entidad) VALUES (NULL,'nadie','inicio_sesion_fallido','usuarios')$t$, 'sjlc_app puede agregar a la bitácora (inicios de sesión)', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
-- Cosas que sí debe poder hacer
SELECT pg_temp.debe_pasar($t$UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1, bloqueado_hasta = now() WHERE nombre_usuario = 'precepcion'$t$, 'sjlc_app puede registrar intentos fallidos y bloqueo', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_pasar($t$DELETE FROM pacientes_encargados WHERE ctid = (SELECT ctid FROM pacientes_encargados LIMIT 1)$t$, 'sjlc_app puede quitar un vínculo paciente-encargado', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_pasar($t$UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = (SELECT min(id_signo_vital) FROM signos_vitales WHERE vigente)$t$, 'sjlc_app puede desactivar un signo vital para corregirlo', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
SELECT pg_temp.debe_pasar($t$SELECT public.unaccent_inmutable('José'), public.formatear_correlativo('SJLC-', 5)$t$, 'sjlc_app puede usar las funciones de búsqueda y de formato', true);
SELECT pg_temp.debe_fallar($t$SELECT public.registrar_bitacora()$t$, '42501', 'sjlc_app no puede llamar la función de bitácora directamente', true, (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'padmin'));
-- Privilegios a nivel de catálogo del sistema
SELECT pg_temp.verificar(NOT has_table_privilege('sjlc_app', 'public.pacientes', 'DELETE'), 'sjlc_app no tiene DELETE sobre pacientes');
SELECT pg_temp.verificar(NOT has_table_privilege('sjlc_app', 'public.pacientes', 'TRUNCATE'), 'sjlc_app no tiene TRUNCATE sobre pacientes');
SELECT pg_temp.verificar(has_table_privilege('sjlc_app', 'public.pacientes_encargados', 'DELETE'), 'sjlc_app sí tiene DELETE sobre pacientes_encargados (única excepción)');
SELECT pg_temp.verificar((SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.role_table_grants WHERE grantee = 'sjlc_app' AND privilege_type = 'DELETE' AND table_schema = 'public') = 'pacientes_encargados,usuarios', 'DELETE solo en pacientes_encargados (corregir un vínculo) y usuarios (cuentas sin actividad, con reglas en un trigger)');
SELECT pg_temp.verificar(NOT has_schema_privilege('sjlc_app', 'public', 'CREATE'), 'sjlc_app no tiene CREATE en el esquema public');
SELECT pg_temp.verificar(NOT has_schema_privilege('public', 'public', 'CREATE'), 'PUBLIC no tiene CREATE en el esquema public');
SELECT pg_temp.verificar(NOT has_database_privilege('public', current_database(), 'CONNECT'), 'PUBLIC no puede conectarse a la base');
SELECT pg_temp.verificar(has_database_privilege('sjlc_app', current_database(), 'CONNECT'), 'sjlc_app sí puede conectarse a la base');
SELECT pg_temp.cerrar();
