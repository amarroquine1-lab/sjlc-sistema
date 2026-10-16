-- La bitácora automática registra quién, qué, cuándo, IP, valor anterior y nuevo.
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); n bigint; r record; BEGIN
    SET LOCAL ROLE sjlc_app;
    PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario = 'precepcion'), true);
    PERFORM set_config('sjlc.direccion_ip', '10.20.30.40', true);
    UPDATE pacientes SET telefono = '55550001' WHERE id_paciente = p;
    UPDATE pacientes SET telefono = '55550002' WHERE id_paciente = p;
    RESET ROLE;
    SELECT * INTO r FROM bitacora WHERE entidad = 'pacientes' AND id_registro = p AND accion = 'editar' ORDER BY id_bitacora DESC LIMIT 1;
    IF r.id_bitacora IS NULL THEN RAISE EXCEPTION 'no se registró la edición'; END IF;
    IF r.id_usuario IS DISTINCT FROM pg_temp.uid('precepcion') THEN RAISE EXCEPTION 'usuario incorrecto: %', r.id_usuario; END IF;
    IF r.direccion_ip IS DISTINCT FROM '10.20.30.40'::inet THEN RAISE EXCEPTION 'IP incorrecta: %', r.direccion_ip; END IF;
    IF r.valor_anterior ->> 'telefono' IS DISTINCT FROM '55550001' THEN RAISE EXCEPTION 'valor anterior incorrecto: %', r.valor_anterior ->> 'telefono'; END IF;
    IF r.valor_nuevo ->> 'telefono' IS DISTINCT FROM '55550002' THEN RAISE EXCEPTION 'valor nuevo incorrecto: %', r.valor_nuevo ->> 'telefono'; END IF;
    IF r.fecha_hora < now() - interval '1 minute' THEN RAISE EXCEPTION 'fecha_hora no es la actual'; END IF;
    END $q$$t$, 'UPDATE de un paciente deja en bitácora usuario, IP, valor anterior y valor nuevo');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); n integer; BEGIN
    SELECT count(*) INTO n FROM bitacora WHERE entidad = 'pacientes' AND id_registro = p AND accion = 'crear';
    IF n <> 1 THEN RAISE EXCEPTION 'esperaba 1 registro de creación y hay %', n; END IF;
    END $q$$t$, 'INSERT de un paciente queda en bitácora como "crear"');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); n integer; BEGIN
    UPDATE pacientes SET telefono = telefono WHERE id_paciente = p;
    SELECT count(*) INTO n FROM bitacora WHERE entidad = 'pacientes' AND id_registro = p AND accion = 'editar';
    IF n <> 0 THEN RAISE EXCEPTION 'un UPDATE sin cambios no debe anotarse (hay %)', n; END IF;
    END $q$$t$, 'un UPDATE que no cambia nada no se anota');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE r record; BEGIN
    UPDATE usuarios SET nombres = 'Otro Nombre' WHERE nombre_usuario = 'psignos';
    SELECT * INTO r FROM bitacora WHERE entidad = 'usuarios' AND accion = 'editar' ORDER BY id_bitacora DESC LIMIT 1;
    IF r.valor_anterior ? 'contrasena_hash' OR r.valor_nuevo ? 'contrasena_hash' THEN RAISE EXCEPTION 'el hash apareció en la bitácora'; END IF;
    IF r.valor_nuevo ->> 'nombres' <> 'Otro Nombre' THEN RAISE EXCEPTION 'no se guardó el cambio de nombre'; END IF;
    END $q$$t$, 'bitácora de usuarios no copia contrasena_hash');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE r record; BEGIN
    UPDATE usuarios SET contrasena_hash = '$argon2id$v=19$m=1,t=1,p=1$cHJ1ZWJh$cHJ1ZWJhcHJ1ZWJh' WHERE nombre_usuario = 'psignos';
    SELECT * INTO r FROM bitacora WHERE entidad = 'usuarios' AND accion = 'editar' ORDER BY id_bitacora DESC LIMIT 1;
    IF r.valor_anterior ? 'contrasena_hash' OR r.valor_nuevo ? 'contrasena_hash' THEN RAISE EXCEPTION 'el hash apareció en la bitácora'; END IF;
    IF (r.valor_nuevo ->> 'contrasena_cambiada') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'no se anotó que la contraseña cambió'; END IF;
    END $q$$t$, 'cambiar la contraseña se anota sin guardar el hash');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); e integer; r record; BEGIN
    INSERT INTO encargados (nombres,apellidos) VALUES ('A','B') RETURNING id_encargado INTO e;
    INSERT INTO pacientes_encargados VALUES (p, e, 'Madre', true);
    DELETE FROM pacientes_encargados WHERE id_paciente = p AND id_encargado = e;
    SELECT * INTO r FROM bitacora WHERE entidad = 'pacientes_encargados' AND id_registro = p AND accion = 'eliminar';
    IF r.id_bitacora IS NULL THEN RAISE EXCEPTION 'el borrado del vínculo no quedó en bitácora'; END IF;
    IF r.valor_anterior ->> 'parentesco' <> 'Madre' THEN RAISE EXCEPTION 'falta el valor anterior'; END IF;
    END $q$$t$, 'borrar un vínculo paciente-encargado queda en bitácora con su valor anterior');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); r integer; BEGIN
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg) VALUES (a,pg_temp.uid('psignos'),50);
    SELECT count(*) INTO r FROM bitacora WHERE entidad = 'signos_vitales' AND accion = 'crear';
    IF r = 0 THEN RAISE EXCEPTION 'los signos vitales no se auditan'; END IF;
    END $q$$t$, 'los registros clínicos se auditan');
SELECT pg_temp.cerrar();
