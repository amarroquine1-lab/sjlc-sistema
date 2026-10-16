-- Migración 013: tramos cerrados al finalizar, cuenta "sistema" protegida, evento cierre_dia.
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); at integer; BEGIN
    at := pg_temp.nueva_atencion(a);
    INSERT INTO recorridos_atencion (id_atencion, id_area) VALUES (at, (SELECT min(id_area) FROM areas));
    UPDATE atenciones SET estado = 'no_concluida', fecha_hora_cierre = now() WHERE id_atencion = at;
    IF EXISTS (SELECT 1 FROM recorridos_atencion WHERE id_atencion = at AND fecha_hora_salida IS NULL) THEN RAISE EXCEPTION 'quedó un tramo abierto'; END IF;
END $q$$t$, 'V-02: al pasar a un estado final se cierran los tramos abiertos');
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='padmin'), true);
    UPDATE usuarios SET activo = true WHERE nombre_usuario = 'sistema'; END $q$$t$, '42501', 'V-03: la aplicación no activa la cuenta sistema');
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='padmin'), true);
    UPDATE usuarios SET contrasena_hash = 'x' WHERE nombre_usuario = 'sistema'; END $q$$t$, '42501', 'V-03: la aplicación no cambia la contraseña de sistema');
SELECT pg_temp.debe_pasar($t$DO $q$ BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='sistema'), true);
    INSERT INTO bitacora (id_usuario, accion, entidad, detalle) VALUES ((SELECT id_usuario FROM usuarios WHERE nombre_usuario='sistema'), 'cierre_dia', 'atenciones', '{"cerradas":0}'); END $q$$t$, 'V-09: cierre_dia es un evento permitido');
SELECT pg_temp.cerrar();
