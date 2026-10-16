-- Migración 016 (provisional): entregas de farmacia.
CREATE FUNCTION pg_temp.receta_con_renglon(OUT r integer, OUT d integer, OUT at integer) LANGUAGE plpgsql AS $f$
BEGIN
    at := pg_temp.nueva_atencion(pg_temp.nuevo_paciente());
    INSERT INTO recetas (id_atencion,id_area,id_usuario) VALUES (at,3,pg_temp.uid('pdoctor')) RETURNING id_receta INTO r;
    INSERT INTO recetas_detalle (id_receta,id_medicamento,cantidad_recetada,indicaciones) VALUES (r,(SELECT min(id_medicamento) FROM medicamentos),10,'1 cada 8 horas') RETURNING id_receta_detalle INTO d;
END $f$;
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE x record; e integer; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')) RETURNING id_entrega_farmacia INTO e;
    INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia,id_receta_detalle,cantidad_entregada,cantidad_no_entregada,observacion) VALUES (e,x.d,6,4,'Sin existencia'); END $q$$t$, 'entrega parcial con motivo');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; e integer; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')) RETURNING id_entrega_farmacia INTO e;
    INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia,id_receta_detalle,cantidad_entregada,cantidad_no_entregada) VALUES (e,x.d,6,4); END $q$$t$, '23514', 'lo no entregado exige observación');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; e integer; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')) RETURNING id_entrega_farmacia INTO e;
    INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia,id_receta_detalle,cantidad_entregada,cantidad_no_entregada,observacion) VALUES (e,x.d,6,3,'x'); END $q$$t$, '23514', 'entregado + no entregado debe igualar lo recetado');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; y record; e integer; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon(); SELECT * INTO y FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')) RETURNING id_entrega_farmacia INTO e;
    INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia,id_receta_detalle,cantidad_entregada) VALUES (e,y.d,10); END $q$$t$, '23514', 'el renglón debe ser de la receta de la entrega');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia'));
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')); END $q$$t$, '23505', 'una receta se entrega una sola vez');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia'));
    DELETE FROM entregas_farmacia WHERE id_receta = x.r; END $q$$t$, '23001', 'las entregas no se borran');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia'));
    UPDATE entregas_farmacia SET recibido_por = 'otro' WHERE id_receta = x.r; END $q$$t$, '23001', 'las entregas no se modifican');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE x record; uf integer := pg_temp.uid('pfarmacia'); BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', uf::text, true);
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,uf); END $q$$t$, 'la aplicación registra entregas (numero de orden por secuencia) con bitácora');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE x record; e integer; BEGIN SELECT * INTO x FROM pg_temp.receta_con_renglon();
    UPDATE recetas SET vigente = false WHERE id_receta = x.r;
    INSERT INTO entregas_farmacia (id_receta,id_usuario) VALUES (x.r,pg_temp.uid('pfarmacia')) RETURNING id_entrega_farmacia INTO e;
    INSERT INTO entregas_farmacia_detalle (id_entrega_farmacia,id_receta_detalle,cantidad_entregada) VALUES (e,x.d,10); END $q$$t$, '23514', 'no se entrega una receta que ya no está vigente');
SELECT pg_temp.cerrar();
