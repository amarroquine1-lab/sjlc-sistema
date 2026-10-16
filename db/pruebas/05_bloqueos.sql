-- Nada se borra ni se reescribe: DELETE, TRUNCATE y UPDATE indebidos.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['areas','roles','tipos_atencion','pueblos','comunidades_linguisticas','departamentos','municipios',
        'presentaciones','medicamentos','usuarios','bitacora','pacientes','encargados','uniones_pacientes','atenciones',
        'recorridos_atencion','proximos_controles','signos_vitales','consultas','diagnosticos_consulta','recetas','recetas_detalle']
    LOOP
        PERFORM pg_temp.verificar((SELECT count(*) FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname LIKE '%bloquear_borrado') > 0, 'DELETE: la tabla ' || t || ' tiene trigger de bloqueo');
        EXECUTE format('SELECT pg_temp.verificar((SELECT count(*) FROM %I) > 0, %L, %L)', t, 'DELETE: ' || t || ' tiene filas para la prueba', 'la tabla está vacía; la prueba no es concluyente');
        PERFORM pg_temp.debe_fallar(format('DELETE FROM %I', t), '23001', 'DELETE bloqueado en ' || t, false, NULL, 'No se permite borrar');
    END LOOP;
    FOREACH t IN ARRAY ARRAY['areas','roles','tipos_atencion','pueblos','comunidades_linguisticas','departamentos','municipios',
        'presentaciones','medicamentos','usuarios','bitacora','pacientes','encargados','pacientes_encargados','uniones_pacientes','atenciones',
        'recorridos_atencion','proximos_controles','signos_vitales','consultas','diagnosticos_consulta','recetas','recetas_detalle']
    LOOP
        PERFORM pg_temp.debe_fallar(format('TRUNCATE %I CASCADE', t), '23001', 'TRUNCATE bloqueado en ' || t);
    END LOOP;
END
$$;
-- pacientes_encargados es la única que admite DELETE (corregir un vínculo equivocado)
SELECT pg_temp.debe_pasar('DELETE FROM pacientes_encargados WHERE ctid = (SELECT ctid FROM pacientes_encargados LIMIT 1)', 'DELETE de un vínculo paciente-encargado se acepta');
-- UPDATE de registros clínicos versionados
SELECT pg_temp.debe_fallar($t$UPDATE signos_vitales SET peso_kg = peso_kg + 1 WHERE id_signo_vital = (SELECT min(id_signo_vital) FROM signos_vitales WHERE vigente)$t$, '23001', 'UPDATE de un dato de signos_vitales se rechaza');
SELECT pg_temp.debe_pasar($t$UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = (SELECT min(id_signo_vital) FROM signos_vitales WHERE vigente)$t$, 'signos_vitales: pasar vigente de true a false se acepta');
SELECT pg_temp.debe_fallar($t$UPDATE signos_vitales SET vigente = false, peso_kg = 1 WHERE id_signo_vital = (SELECT min(id_signo_vital) FROM signos_vitales WHERE vigente)$t$, '23001', 'signos_vitales: desactivar y cambiar otro dato a la vez se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE s integer; BEGIN SELECT min(id_signo_vital) INTO s FROM signos_vitales WHERE vigente; UPDATE signos_vitales SET vigente = false WHERE id_signo_vital = s; UPDATE signos_vitales SET vigente = true WHERE id_signo_vital = s; END $q$$t$, '23001', 'signos_vitales: reactivar un registro desactivado se rechaza');
SELECT pg_temp.debe_fallar($t$UPDATE consultas SET motivo_consulta = 'otro' WHERE id_consulta = (SELECT min(id_consulta) FROM consultas WHERE vigente)$t$, '23001', 'UPDATE de un dato de consultas se rechaza');
SELECT pg_temp.debe_pasar($t$UPDATE consultas SET vigente = false WHERE id_consulta = (SELECT min(id_consulta) FROM consultas WHERE vigente)$t$, 'consultas: pasar vigente de true a false se acepta');
SELECT pg_temp.debe_fallar($t$UPDATE recetas SET id_area = 5 WHERE id_receta = (SELECT min(id_receta) FROM recetas WHERE vigente)$t$, '23001', 'UPDATE de un dato de recetas se rechaza');
SELECT pg_temp.debe_pasar($t$UPDATE recetas SET vigente = false WHERE id_receta = (SELECT min(id_receta) FROM recetas WHERE vigente)$t$, 'recetas: pasar vigente de true a false se acepta');
-- Tablas sin ningún UPDATE
SELECT pg_temp.debe_fallar($t$UPDATE recetas_detalle SET cantidad_recetada = 99 WHERE id_receta_detalle = (SELECT min(id_receta_detalle) FROM recetas_detalle)$t$, '23001', 'UPDATE en recetas_detalle se rechaza');
SELECT pg_temp.debe_fallar($t$UPDATE diagnosticos_consulta SET descripcion_diagnostico = 'x' WHERE id_diagnostico_consulta = (SELECT min(id_diagnostico_consulta) FROM diagnosticos_consulta)$t$, '23001', 'UPDATE en diagnosticos_consulta se rechaza');
SELECT pg_temp.debe_fallar($t$UPDATE bitacora SET detalle = 'x' WHERE id_bitacora = (SELECT min(id_bitacora) FROM bitacora)$t$, '23001', 'UPDATE en bitacora se rechaza');
SELECT pg_temp.debe_fallar($t$UPDATE uniones_pacientes SET motivo = 'x' WHERE id_union_paciente = (SELECT min(id_union_paciente) FROM uniones_pacientes)$t$, '23001', 'UPDATE en uniones_pacientes se rechaza');
SELECT pg_temp.cerrar();
