-- Búsqueda sin tildes ni mayúsculas, índice y formato de correlativos.
-- Esta prueba mueve secuencias (no se revierten): solo corre en la base desechable.
SELECT pg_temp.verificar((SELECT provolatile = 'i' FROM pg_proc WHERE proname = 'unaccent_inmutable'), 'unaccent_inmutable es IMMUTABLE');
SELECT pg_temp.verificar(public.unaccent_inmutable('José María Peñalver') = 'Jose Maria Penalver', 'unaccent quita tildes y conserva la ñ');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer; n integer; BEGIN
    INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('José','Pérez Zúñiga','1980-05-05','M',pg_temp.uid('precepcion')) RETURNING id_paciente INTO p;
    SELECT count(*) INTO n FROM pacientes WHERE public.unaccent_inmutable(lower(coalesce(nombres,'') || ' ' || coalesce(apellidos,''))) LIKE '%' || public.unaccent_inmutable(lower('JOSE')) || '%' AND id_paciente = p;
    IF n <> 1 THEN RAISE EXCEPTION 'JOSE no encontró a José'; END IF;
    SELECT count(*) INTO n FROM pacientes WHERE public.unaccent_inmutable(lower(coalesce(nombres,'') || ' ' || coalesce(apellidos,''))) LIKE '%' || public.unaccent_inmutable(lower('zuniga')) || '%' AND id_paciente = p;
    IF n <> 1 THEN RAISE EXCEPTION 'zuniga no encontró a Zúñiga'; END IF;
    END $q$$t$, 'la búsqueda sin tildes ni mayúsculas encuentra "JOSE" y "zuniga"');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer; n integer; BEGIN
    INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('María','López','1990-01-01','F',pg_temp.uid('precepcion')) RETURNING id_paciente INTO p;
    SELECT count(*) INTO n FROM pacientes WHERE public.unaccent_inmutable(lower(coalesce(nombres,'') || ' ' || coalesce(apellidos,''))) LIKE '%maria%' AND id_paciente = p;
    IF n <> 1 THEN RAISE EXCEPTION 'maria no encontró a María'; END IF;
    END $q$$t$, 'la búsqueda "maria" encuentra "María"');
-- El índice GIN se usa cuando el planificador no puede preferir otro camino
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE linea text; usa boolean := false; BEGIN
    EXECUTE 'SET LOCAL enable_seqscan = off';
    FOR linea IN EXECUTE $e$EXPLAIN SELECT id_paciente FROM pacientes WHERE public.unaccent_inmutable(lower(coalesce(nombres,'') || ' ' || coalesce(apellidos,''))) LIKE '%jose%'$e$ LOOP
        IF linea LIKE '%ix_pacientes_nombre_trgm%' THEN usa := true; END IF;
    END LOOP;
    IF NOT usa THEN RAISE EXCEPTION 'el plan no usa ix_pacientes_nombre_trgm'; END IF;
    END $q$$t$, 'el índice GIN pg_trgm de nombres es utilizable con la expresión exacta');
-- Formato de los correlativos
SELECT pg_temp.verificar(public.formatear_correlativo('SJLC-', 1) = 'SJLC-000001', 'formato: 1 -> SJLC-000001');
SELECT pg_temp.verificar(public.formatear_correlativo('SJLC-', 123) = 'SJLC-000123', 'formato: 123 -> SJLC-000123');
SELECT pg_temp.verificar(public.formatear_correlativo('A-', 4587) = 'A-004587', 'formato: 4587 -> A-004587');
SELECT pg_temp.verificar(public.formatear_correlativo('SJLC-', 999999) = 'SJLC-999999', 'formato: 999999 -> SJLC-999999');
SELECT pg_temp.verificar(public.formatear_correlativo('SJLC-', 1000000) = 'SJLC-1000000', 'formato: 1000000 no se corta (SJLC-1000000)');
SELECT pg_temp.verificar(public.formatear_correlativo('A-', 12345678) = 'A-12345678', 'formato: 12345678 conserva todos los dígitos');
SELECT setval('seq_codigo_paciente', 999999);
SELECT setval('seq_numero_atencion', 999999);
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE c text; BEGIN
    INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('Millón','Prueba','1990-01-01','F',pg_temp.uid('precepcion')) RETURNING codigo_paciente INTO c;
    IF c <> 'SJLC-1000000' THEN RAISE EXCEPTION 'código inesperado: %', c; END IF;
    END $q$$t$, 'al pasar de 999999 el código de paciente sigue válido (SJLC-1000000)');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer; n text; BEGIN
    a := pg_temp.nueva_atencion(pg_temp.nuevo_paciente());
    SELECT numero_atencion INTO n FROM atenciones WHERE id_atencion = a;
    IF n !~ '^A-[0-9]{7,}$' THEN RAISE EXCEPTION 'número inesperado: %', n; END IF;
    END $q$$t$, 'al pasar de 999999 el número de atención sigue válido');
SELECT pg_temp.verificar((SELECT count(*) FROM (SELECT codigo_paciente FROM pacientes GROUP BY 1 HAVING count(*) > 1) x) = 0, 'no hay códigos de paciente repetidos');
SELECT pg_temp.verificar(
    (SELECT last_value FROM seq_codigo_paciente) >= 1000000 AND (SELECT cycle FROM pg_sequences WHERE sequencename = 'seq_codigo_paciente') = false,
    'la secuencia de pacientes no es cíclica (nunca se reinicia)');
SELECT pg_temp.cerrar();
