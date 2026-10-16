-- Migración 014: una receta vigente por atención y área; catálogo de medicamentos administrable por la aplicación.
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); at integer; BEGIN
    at := pg_temp.nueva_atencion(a);
    INSERT INTO recetas (id_atencion, id_area, id_usuario) VALUES (at, 3, pg_temp.uid('pdoctor'));
    INSERT INTO recetas (id_atencion, id_area, id_usuario) VALUES (at, 3, pg_temp.uid('pdoctor')); END $q$$t$, '23505', 'dos recetas vigentes del mismo área en una atención se rechazan');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); at integer; BEGIN
    at := pg_temp.nueva_atencion(a);
    INSERT INTO recetas (id_atencion, id_area, id_usuario) VALUES (at, 3, pg_temp.uid('pdoctor'));
    INSERT INTO recetas (id_atencion, id_area, id_usuario) VALUES (at, 4, pg_temp.uid('pnutricion')); END $q$$t$, 'doctor y nutrición pueden recetar en la misma atención');
SELECT pg_temp.debe_pasar($t$DO $q$ BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='padmin'), true);
    INSERT INTO medicamentos (nombre_medicamento, id_presentacion) VALUES ('Medicamento de prueba 014', (SELECT min(id_presentacion) FROM presentaciones));
    UPDATE medicamentos SET activo = false WHERE nombre_medicamento = 'Medicamento de prueba 014';
    RESET ROLE;
    IF (SELECT count(*) FROM bitacora WHERE entidad = 'medicamentos') < 2 THEN RAISE EXCEPTION 'sin bitácora'; END IF; END $q$$t$, 'la aplicación crea y desactiva medicamentos y queda en bitácora');
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='padmin'), true);
    UPDATE medicamentos SET nombre_medicamento = 'otro' WHERE id_medicamento = (SELECT min(id_medicamento) FROM medicamentos); END $q$$t$, '42501', 'no se renombra un medicamento (solo activar o desactivar)');
SELECT pg_temp.cerrar();
