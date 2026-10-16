-- Migración 018: la receta se escribe en texto libre; el catálogo ya no es obligatorio.
CREATE FUNCTION pg_temp.receta_vacia(OUT r integer) LANGUAGE plpgsql AS $f$
DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente());
BEGIN INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (at,3,pg_temp.uid('pdoctor')) RETURNING id_receta INTO r; END $f$;
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE r integer := (SELECT pg_temp.receta_vacia()); BEGIN
    INSERT INTO recetas_detalle (id_receta,medicamento_texto,presentacion_texto,cantidad_recetada,indicaciones) VALUES (r,'Cualquier medicamento 10 mg','jarabe',1,'5 ml cada 8 horas'); END $q$$t$, 'se receta con texto libre y sin catálogo');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE r integer := (SELECT pg_temp.receta_vacia()); n text; BEGIN
    INSERT INTO recetas_detalle (id_receta,id_medicamento,cantidad_recetada,indicaciones) VALUES (r,(SELECT min(id_medicamento) FROM medicamentos),1,'x');
    SELECT medicamento_texto INTO n FROM recetas_detalle WHERE id_receta = r;
    IF n IS NULL OR n = '' THEN RAISE EXCEPTION 'no se completó el texto'; END IF; END $q$$t$, 'un renglón con medicamento del catálogo toma el texto del catálogo');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE r integer := (SELECT pg_temp.receta_vacia()); BEGIN
    INSERT INTO recetas_detalle (id_receta,cantidad_recetada,indicaciones) VALUES (r,1,'x'); END $q$$t$, '23502', 'sin texto ni catálogo se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE r integer := (SELECT pg_temp.receta_vacia()); BEGIN
    INSERT INTO recetas_detalle (id_receta,medicamento_texto,presentacion_texto,cantidad_recetada,indicaciones) VALUES (r,'   ','tableta',1,'x'); END $q$$t$, '23514', 'el medicamento en blanco se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE r integer := (SELECT pg_temp.receta_vacia()); uf integer := pg_temp.uid('pdoctor'); BEGIN
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', uf::text, true);
    INSERT INTO recetas_detalle (id_receta,medicamento_texto,presentacion_texto,cantidad_recetada,indicaciones) VALUES (r,'Zinc 20 mg','tableta',30,'1 al día'); END $q$$t$, 'la aplicación inserta renglones de texto libre');
SELECT pg_temp.cerrar();
