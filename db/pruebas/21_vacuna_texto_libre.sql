-- Migración 021: la vacuna se escribe en texto libre; el catálogo ya no es obligatorio.
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,nombre_vacuna_texto,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,'Vacuna que no está en el catálogo',1,current_date,pg_temp.uid('pvacunacion')); END $q$$t$, 'se registra una vacuna con texto libre y sin catálogo');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); n text; BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,pg_temp.uid('pvacunacion'));
    SELECT nombre_vacuna_texto INTO n FROM vacunas_aplicadas WHERE id_atencion = at;
    IF n IS NULL OR n = '' THEN RAISE EXCEPTION 'no se completó el nombre'; END IF; END $q$$t$, 'una vacuna del catálogo toma su nombre del catálogo');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,1,current_date,pg_temp.uid('pvacunacion')); END $q$$t$, '23502', 'sin nombre ni catálogo se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,nombre_vacuna_texto,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,'Sarampión',1,current_date,pg_temp.uid('pvacunacion'));
    INSERT INTO vacunas_aplicadas (id_atencion,nombre_vacuna_texto,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,'  sarampion ',1,current_date,pg_temp.uid('pvacunacion')); END $q$$t$, '23505', 'la misma dosis no se repite aunque cambien mayúsculas, tildes o espacios');
SELECT pg_temp.verificar(NOT EXISTS (SELECT 1 FROM vacunas_aplicadas WHERE nombre_vacuna_texto IS NULL), 'toda vacuna aplicada tiene nombre');
