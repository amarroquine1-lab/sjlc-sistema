-- 014: consulta del doctor, recetas y catálogo de medicamentos administrable.

-- Una sola receta vigente por atención y área que receta (doctor y nutrición pueden recetar en la misma atención).
CREATE UNIQUE INDEX ux_recetas_vigente ON recetas (id_atencion, id_area) WHERE vigente;

-- El catálogo de medicamentos lo mantienen los administradores desde el sistema (queda en bitácora).
GRANT INSERT (nombre_medicamento, id_presentacion, concentracion) ON medicamentos TO sjlc_app;
GRANT UPDATE (activo) ON medicamentos TO sjlc_app;
GRANT INSERT (nombre_presentacion) ON presentaciones TO sjlc_app;

CREATE TRIGGER trg_presentaciones_bitacora AFTER INSERT OR UPDATE ON presentaciones
    FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_presentacion');

CREATE TRIGGER trg_medicamentos_bitacora AFTER INSERT OR UPDATE ON medicamentos
    FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_medicamento');
