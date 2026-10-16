-- Signos vitales, consultas, diagnósticos y recetas: rangos y versionado.

DO $externo$
DECLARE
    v record;
BEGIN
    -- (columna, valor aceptado, valor bajo, valor alto) con el resto de la fila válida
    FOR v IN SELECT * FROM (VALUES
        ('peso_kg', '52.3', '0.2', '300.1'),
        ('talla_cm', '148', '29', '250.1'),
        ('temperatura_c', '36.6', '29.9', '45.1'),
        ('frecuencia_cardiaca', '55', '19', '251'),
        ('saturacion_oxigeno', '97', '49', '101')
    ) AS t(columna, bueno, bajo, alto)
    LOOP
        PERFORM pg_temp.debe_pasar(format($f$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,%1$I) VALUES (a,pg_temp.uid('psignos'),%2$s); END $q$$f$, v.columna, v.bueno), 'signos: ' || v.columna || ' dentro del rango se acepta');
        PERFORM pg_temp.debe_fallar(format($f$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,%1$I) VALUES (a,pg_temp.uid('psignos'),%2$s); END $q$$f$, v.columna, v.bajo), '23514', 'signos: ' || v.columna || ' por debajo del mínimo se rechaza');
        PERFORM pg_temp.debe_fallar(format($f$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,%1$I) VALUES (a,pg_temp.uid('psignos'),%2$s); END $q$$f$, v.columna, v.alto), '23514', 'signos: ' || v.columna || ' por encima del máximo se rechaza');
    END LOOP;
END
$externo$;

SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),139,75); END $q$$t$, 'presión 139/75 se acepta');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),49,30); END $q$$t$, '23514', 'sistólica 49 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),261,100); END $q$$t$, '23514', 'sistólica 261 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),120,19); END $q$$t$, '23514', 'diastólica 19 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),120,161); END $q$$t$, '23514', 'diastólica 161 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica,presion_diastolica) VALUES (a,pg_temp.uid('psignos'),70,90); END $q$$t$, '23514', 'sistólica menor que diastólica se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO signos_vitales (id_atencion,id_usuario,presion_sistolica) VALUES (a,pg_temp.uid('psignos'),120); END $q$$t$, '23514', 'presión con solo un valor se rechaza');
-- Versionado: un solo vigente por atención; la corrección desactiva el anterior
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg) VALUES (a,pg_temp.uid('psignos'),50);
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg) VALUES (a,pg_temp.uid('psignos'),51); END $q$$t$, '23505', 'dos signos vigentes en la misma atención se rechazan');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); s integer; BEGIN
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg) VALUES (a,pg_temp.uid('psignos'),50) RETURNING id_signo_vital INTO s;
    UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = s;
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg,corrige_a) VALUES (a,pg_temp.uid('psignos'),51,s); END $q$$t$, 'corrección: se desactiva el registro y se inserta uno nuevo con corrige_a');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); s integer; BEGIN
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg) VALUES (a,pg_temp.uid('psignos'),50) RETURNING id_signo_vital INTO s;
    UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = s;
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg,corrige_a) VALUES (a,pg_temp.uid('psignos'),51,s);
    INSERT INTO signos_vitales (id_atencion,id_usuario,peso_kg,corrige_a) VALUES (a,pg_temp.uid('psignos'),52,s); END $q$$t$, '23505', 'un registro solo se corrige una vez (corrige_a único)');
-- Consultas
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera','dolor de cabeza'); END $q$$t$, 'consulta válida');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'otra','dolor'); END $q$$t$, '23514', 'tipo de consulta inválido se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera',NULL); END $q$$t$, '23502', 'consulta sin motivo se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta,semana_gestacion) VALUES (a,pg_temp.uid('pdoctor'),'control','embarazo',0); END $q$$t$, '23514', 'semana de gestación 0 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta,semana_gestacion) VALUES (a,pg_temp.uid('pdoctor'),'control','embarazo',43); END $q$$t$, '23514', 'semana de gestación 43 se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta,semana_gestacion) VALUES (a,pg_temp.uid('pdoctor'),'control','embarazo',24); END $q$$t$, 'semana de gestación 24 se acepta');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera','uno');
    INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctora'),'primera','dos'); END $q$$t$, '23505', 'dos consultas vigentes en la misma atención se rechazan');
-- Diagnósticos
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); c integer; BEGIN
    INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera','tos') RETURNING id_consulta INTO c;
    INSERT INTO diagnosticos_consulta (id_consulta,descripcion_diagnostico,codigo_cie10) VALUES (c,'Resfriado común','J00');
    INSERT INTO diagnosticos_consulta (id_consulta,descripcion_diagnostico,codigo_cie10) VALUES (c,'Control del niño sano','Z00.1');
    INSERT INTO diagnosticos_consulta (id_consulta,descripcion_diagnostico) VALUES (c,'Sin código'); END $q$$t$, 'varios diagnósticos por consulta, con y sin código CIE-10');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); c integer; BEGIN
    INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera','tos') RETURNING id_consulta INTO c;
    INSERT INTO diagnosticos_consulta (id_consulta,descripcion_diagnostico,codigo_cie10) VALUES (c,'X','ABC'); END $q$$t$, '23514', 'código CIE-10 mal formado (ABC) se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); c integer; BEGIN
    INSERT INTO consultas (id_atencion,id_usuario,tipo_consulta,motivo_consulta) VALUES (a,pg_temp.uid('pdoctor'),'primera','tos') RETURNING id_consulta INTO c;
    INSERT INTO diagnosticos_consulta (id_consulta,descripcion_diagnostico,codigo_cie10) VALUES (c,'X','j00'); END $q$$t$, '23514', 'código CIE-10 en minúscula se rechaza');
-- Recetas
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); r integer; BEGIN
    INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (a,3,pg_temp.uid('pdoctor')) RETURNING id_receta INTO r;
    INSERT INTO recetas_detalle (id_receta,id_medicamento,cantidad_recetada,indicaciones) SELECT r,min(id_medicamento),30,'1 cada 8 horas' FROM medicamentos; END $q$$t$, 'receta del doctor con un medicamento');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); r integer; BEGIN
    INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (a,4,pg_temp.uid('pnutricion')) RETURNING id_receta INTO r; END $q$$t$, 'nutrición puede recetar (receta ligada a la atención)');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); r integer; BEGIN
    INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (a,3,pg_temp.uid('pdoctor')) RETURNING id_receta INTO r;
    INSERT INTO recetas_detalle (id_receta,id_medicamento,cantidad_recetada,indicaciones) SELECT r,min(id_medicamento),0,'x' FROM medicamentos; END $q$$t$, '23514', 'cantidad recetada 0 se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); r integer; BEGIN
    INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (a,3,pg_temp.uid('pdoctor')) RETURNING id_receta INTO r;
    INSERT INTO recetas_detalle (id_receta,id_medicamento,medicamento_texto,presentacion_texto,cantidad_recetada,indicaciones) VALUES (r,999999,'x','tableta',1,'x'); END $q$$t$, '23503', 'un id de catálogo inexistente se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO medicamentos (nombre_medicamento,id_presentacion,concentracion) SELECT nombre_medicamento,id_presentacion,concentracion FROM medicamentos LIMIT 1$t$, '23505', 'medicamento repetido con la misma presentación y concentración se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO medicamentos (nombre_medicamento,id_presentacion) VALUES ('Medicamento sin concentración',1),('Medicamento sin concentración',1)$t$, '23505', 'medicamento repetido sin concentración también se rechaza (NULLS NOT DISTINCT)');
SELECT pg_temp.cerrar();
