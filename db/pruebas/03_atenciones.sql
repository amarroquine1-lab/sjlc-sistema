-- Atenciones, recorridos por áreas y próximos controles.
SELECT pg_temp.verificar((SELECT count(*) FROM atenciones WHERE numero_atencion !~ '^A-[0-9]{6,}$') = 0, 'todos los números de atención tienen formato A-NNNNNN');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN PERFORM pg_temp.nueva_atencion(p); PERFORM pg_temp.nueva_atencion(p); END $q$$t$, '23505', 'dos atenciones abiertas del mismo paciente se rechazan');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN PERFORM pg_temp.nueva_atencion(p, 'en_espera'); PERFORM pg_temp.nueva_atencion(p, 'enviado'); END $q$$t$, '23505', 'espera más enviado del mismo paciente también se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN PERFORM pg_temp.nueva_atencion(p, 'finalizada'); PERFORM pg_temp.nueva_atencion(p, 'se_retiro'); PERFORM pg_temp.nueva_atencion(p, 'en_espera'); END $q$$t$, 'un paciente puede tener varias atenciones cerradas y una abierta');
SELECT pg_temp.debe_fallar($t$INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario) VALUES ((SELECT min(id_paciente) FROM pacientes),(SELECT min(id_tipo_atencion) FROM tipos_atencion),'inventado',pg_temp.uid('precepcion'))$t$, '23514', 'estado de atención inválido se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario) VALUES (p,(SELECT min(id_tipo_atencion) FROM tipos_atencion),'finalizada',pg_temp.uid('precepcion')); END $q$$t$, '23514', 'atención finalizada sin hora de cierre se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario,fecha_hora_cierre) VALUES (p,(SELECT min(id_tipo_atencion) FROM tipos_atencion),'en_espera',pg_temp.uid('precepcion'),now()); END $q$$t$, '23514', 'atención abierta con hora de cierre se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario,fecha_hora_cierre) VALUES (p,(SELECT min(id_tipo_atencion) FROM tipos_atencion),'finalizada',pg_temp.uid('precepcion'),now() - interval '1 day'); END $q$$t$, '23514', 'cierre anterior a la llegada se rechaza');
-- Recorridos
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (a,1); END $q$$t$, 'tramo en la cola de un área se acepta');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (a,1);
    INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (a,2); END $q$$t$, '23505', 'una atención no puede estar en dos áreas a la vez');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_entrada,fecha_hora_inicio,fecha_hora_salida,id_usuario) VALUES (a,1,now()-interval '3 min',now()-interval '2 min',now()-interval '1 min',pg_temp.uid('precepcion'));
    INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (a,2); END $q$$t$, 'al cerrar un tramo la atención pasa a la siguiente área');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); b integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); u integer := pg_temp.nuevo_usuario('ztestuno'); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (a,3,now(),u);
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (b,3,now(),u); END $q$$t$, '23505', 'un doctor no puede atender a dos pacientes a la vez');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); b integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (a,3,now(),pg_temp.nuevo_usuario('ztestuno'));
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio,id_usuario) VALUES (b,3,now(),pg_temp.nuevo_usuario('ztestdos')); END $q$$t$, 'dos doctores distintos atienden a la vez a pacientes distintos');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_inicio) VALUES (a,3,now()); END $q$$t$, '23514', 'iniciar atención sin usuario se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_entrada,fecha_hora_inicio,id_usuario) VALUES (a,3,now(),now() - interval '1 hour',pg_temp.uid('pdoctor')); END $q$$t$, '23514', 'inicio anterior a la entrada se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,fecha_hora_entrada,fecha_hora_inicio,fecha_hora_salida,id_usuario) VALUES (a,3,now(),now(),now() - interval '1 hour',pg_temp.uid('pdoctor')); END $q$$t$, '23514', 'salida anterior al inicio se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (999999999,1)$t$, '23503', 'tramo de una atención inexistente se rechaza');
-- Próximos controles
SELECT pg_temp.debe_fallar($t$INSERT INTO proximos_controles (id_paciente,id_atencion,id_area,descripcion,estado,id_usuario) SELECT id_paciente,id_atencion,5,'dosis','vencido',pg_temp.uid('pvacunacion') FROM atenciones LIMIT 1$t$, '23514', 'estado de próximo control inválido se rechaza');
SELECT pg_temp.debe_pasar($t$INSERT INTO proximos_controles (id_paciente,id_atencion,id_area,descripcion,id_usuario) SELECT id_paciente,id_atencion,5,'Pentavalente 2.ª dosis',pg_temp.uid('pvacunacion') FROM atenciones LIMIT 1$t$, 'próximo control válido, estado por omisión pendiente');
SELECT pg_temp.cerrar();
