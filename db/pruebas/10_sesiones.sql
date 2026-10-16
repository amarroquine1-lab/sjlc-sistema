-- Migración 010: sesiones en el servidor.
SELECT pg_temp.verificar(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sesiones'), 'la tabla sesiones existe');
SELECT pg_temp.debe_pasar($t$INSERT INTO sesiones (id_usuario,direccion_ip,agente_usuario) VALUES (pg_temp.uid('precepcion'),'203.0.113.7','navegador')$t$, 'sesión: el id es un uuid generado por la base (jti)');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE s record; BEGIN
    INSERT INTO sesiones (id_usuario) VALUES (pg_temp.uid('precepcion')) RETURNING * INTO s;
    IF s.id_sesion IS NULL THEN RAISE EXCEPTION 'sin id'; END IF;
    IF s.fecha_hora_vence_absoluta < now() + interval '11 hours 59 minutes' OR s.fecha_hora_vence_absoluta > now() + interval '12 hours 1 minute' THEN RAISE EXCEPTION 'la duración máxima no es de 12 horas'; END IF;
    IF s.revocada_en IS NOT NULL THEN RAISE EXCEPTION 'nace revocada'; END IF; END $q$$t$, 'sesión: vence a las 12 horas y nace sin revocar');
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_usuario,agente_usuario) VALUES (pg_temp.uid('precepcion'),repeat('x',201))$t$, '23514', 'sesión: agente_usuario de más de 200 caracteres se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_usuario,revocada_en) VALUES (pg_temp.uid('precepcion'),now())$t$, '23514', 'sesión: revocada_en sin motivo se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_usuario,revocada_en,motivo_revocacion) VALUES (pg_temp.uid('precepcion'),now(),'porque si')$t$, '23514', 'sesión: motivo fuera de la lista se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_usuario) VALUES (999999)$t$, '23503', 'sesión: usuario inexistente se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN INSERT INTO sesiones (id_usuario) VALUES (pg_temp.uid('precepcion')); DELETE FROM sesiones; END $q$$t$, '23001', 'sesión: DELETE bloqueado');
SELECT pg_temp.debe_fallar('TRUNCATE sesiones', '23001', 'sesión: TRUNCATE bloqueado');
-- Como la aplicación
SELECT pg_temp.debe_pasar($t$INSERT INTO sesiones (id_usuario,direccion_ip,agente_usuario) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'),'203.0.113.7','navegador')$t$, 'sjlc_app puede crear una sesión', true, NULL);
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_usuario,fecha_hora_vence_absoluta) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'), now() + interval '30 days')$t$, '42501', 'sjlc_app no puede fijar el vencimiento absoluto', true, NULL);
SELECT pg_temp.debe_fallar($t$INSERT INTO sesiones (id_sesion,id_usuario) VALUES (gen_random_uuid(),(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion'))$t$, '42501', 'sjlc_app no puede fijar el id de sesión', true, NULL);
SELECT pg_temp.debe_fallar($t$DELETE FROM sesiones$t$, '42501', 'sjlc_app no puede borrar sesiones', true, NULL);
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE s uuid; BEGIN
    INSERT INTO sesiones (id_usuario) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion')) RETURNING id_sesion INTO s;
    UPDATE sesiones SET fecha_hora_ultima_actividad = now() WHERE id_sesion = s;
    UPDATE sesiones SET revocada_en = now(), motivo_revocacion = 'salida' WHERE id_sesion = s; END $q$$t$, 'sjlc_app renueva la actividad y revoca una sesión', true, NULL);
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE s uuid; BEGIN
    INSERT INTO sesiones (id_usuario) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion')) RETURNING id_sesion INTO s;
    UPDATE sesiones SET revocada_en = now(), motivo_revocacion = 'salida' WHERE id_sesion = s;
    UPDATE sesiones SET revocada_en = NULL, motivo_revocacion = NULL WHERE id_sesion = s; END $q$$t$, '23001', 'una sesión revocada no se reactiva', true, NULL);
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE s uuid; BEGIN
    INSERT INTO sesiones (id_usuario) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion')) RETURNING id_sesion INTO s;
    UPDATE sesiones SET fecha_hora_ultima_actividad = now() - interval '1 hour' WHERE id_sesion = s; END $q$$t$, '23001', 'la última actividad no retrocede', true, NULL);
SELECT pg_temp.debe_fallar($t$UPDATE sesiones SET fecha_hora_vence_absoluta = now() + interval '30 days'$t$, '42501', 'sjlc_app no puede extender el vencimiento', true, NULL);
SELECT pg_temp.debe_fallar($t$UPDATE sesiones SET id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre_usuario='padmin')$t$, '42501', 'sjlc_app no puede cambiar el dueño de la sesión', true, NULL);
SELECT pg_temp.debe_fallar($t$UPDATE sesiones SET id_sesion = gen_random_uuid()$t$, '42501', 'sjlc_app no puede cambiar el id de sesión', true, NULL);
SELECT pg_temp.cerrar();
