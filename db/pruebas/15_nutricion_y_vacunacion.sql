-- Migración 015 (provisional): evaluaciones nutricionales y vacunas aplicadas.
SELECT pg_temp.debe_pasar($t$DO $q$ BEGIN IF (SELECT count(*) FROM vacunas) < 5 THEN RAISE EXCEPTION 'sin catálogo de vacunas'; END IF; END $q$$t$, 'el catálogo provisional de vacunas está cargado');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO evaluaciones_nutricionales (id_atencion,id_usuario,diagnostico_nutricional) VALUES (at,pg_temp.uid('pnutricion'),'Desnutrición');
    INSERT INTO evaluaciones_nutricionales (id_atencion,id_usuario,diagnostico_nutricional) VALUES (at,pg_temp.uid('pnutricion'),'Otra'); END $q$$t$, '23505', 'una sola evaluación vigente por atención');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO evaluaciones_nutricionales (id_atencion,id_usuario,diagnostico_nutricional) VALUES (at,pg_temp.uid('pnutricion'),'x');
    DELETE FROM evaluaciones_nutricionales WHERE id_atencion = at; END $q$$t$, '23001', 'las evaluaciones no se borran');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO evaluaciones_nutricionales (id_atencion,id_usuario,diagnostico_nutricional,codigo_cie10) VALUES (at,pg_temp.uid('pnutricion'),'x','ZZ'); END $q$$t$, '23514', 'CIE-10 con formato válido');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,pg_temp.uid('pvacunacion'));
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,pg_temp.uid('pvacunacion')); END $q$$t$, '23505', 'la misma dosis no se registra dos veces en una atención');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date + 3,pg_temp.uid('pvacunacion')); END $q$$t$, '23514', 'no hay vacunas con fecha futura');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,pg_temp.uid('pvacunacion'));
    DELETE FROM vacunas_aplicadas WHERE id_atencion = at; END $q$$t$, '23001', 'las vacunas aplicadas no se borran');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); uv integer := pg_temp.uid('pvacunacion'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='pvacunacion'), true);
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,uv);
    UPDATE vacunas_aplicadas SET vigente = false WHERE id_atencion = at; END $q$$t$, 'la aplicación registra y desactiva (corrige) con bitácora');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); uv integer := pg_temp.uid('pvacunacion'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='pvacunacion'), true);
    INSERT INTO vacunas_aplicadas (id_atencion,id_vacuna,numero_dosis,fecha_aplicacion,id_usuario) VALUES (at,(SELECT min(id_vacuna) FROM vacunas),1,current_date,uv);
    UPDATE vacunas_aplicadas SET lote = 'cambiado' WHERE id_atencion = at; END $q$$t$, '42501', 'no se edita un registro de vacuna (solo se corrige con uno nuevo)');
SELECT pg_temp.cerrar();
