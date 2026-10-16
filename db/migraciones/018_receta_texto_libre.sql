-- 018: la receta se escribe en texto libre (medicamento, presentación, cantidad e indicaciones). No hay inventario:
-- el catálogo de medicamentos deja de ser obligatorio y queda solo como dato histórico y de apoyo.

ALTER TABLE recetas_detalle ADD COLUMN medicamento_texto text;
ALTER TABLE recetas_detalle ADD COLUMN presentacion_texto text;

-- Lo recetado antes de este cambio conserva su texto tomado del catálogo. Es una carga única, hecha por el dueño de la base.
ALTER TABLE recetas_detalle DISABLE TRIGGER USER;
UPDATE recetas_detalle d
   SET medicamento_texto = trim(m.nombre_medicamento || ' ' || coalesce(m.concentracion, '')), presentacion_texto = p.nombre_presentacion
  FROM medicamentos m JOIN presentaciones p USING (id_presentacion)
 WHERE m.id_medicamento = d.id_medicamento;
ALTER TABLE recetas_detalle ENABLE TRIGGER USER;

ALTER TABLE recetas_detalle ALTER COLUMN medicamento_texto SET NOT NULL;
ALTER TABLE recetas_detalle ALTER COLUMN presentacion_texto SET NOT NULL;
ALTER TABLE recetas_detalle ALTER COLUMN id_medicamento DROP NOT NULL;
ALTER TABLE recetas_detalle ADD CONSTRAINT ck_recetas_detalle_medicamento_texto CHECK (length(trim(medicamento_texto)) BETWEEN 1 AND 120);
ALTER TABLE recetas_detalle ADD CONSTRAINT ck_recetas_detalle_presentacion_texto CHECK (length(trim(presentacion_texto)) BETWEEN 1 AND 60);

-- Si alguien inserta con un medicamento del catálogo y sin texto (seeds y datos viejos), el texto se toma del catálogo.
CREATE FUNCTION public.completar_receta_texto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.medicamento_texto IS NULL AND NEW.id_medicamento IS NOT NULL THEN
        SELECT trim(m.nombre_medicamento || ' ' || coalesce(m.concentracion, '')), p.nombre_presentacion
          INTO NEW.medicamento_texto, NEW.presentacion_texto
          FROM public.medicamentos m JOIN public.presentaciones p USING (id_presentacion) WHERE m.id_medicamento = NEW.id_medicamento;
    END IF;
    RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.completar_receta_texto() FROM PUBLIC;
CREATE TRIGGER trg_recetas_detalle_completar_texto BEFORE INSERT ON recetas_detalle FOR EACH ROW EXECUTE FUNCTION public.completar_receta_texto();

-- Para sugerir lo ya escrito antes
CREATE INDEX ix_recetas_detalle_medicamento_texto ON recetas_detalle (public.unaccent_inmutable(lower(medicamento_texto)) text_pattern_ops);
CREATE INDEX ix_recetas_detalle_presentacion_texto ON recetas_detalle (public.unaccent_inmutable(lower(presentacion_texto)) text_pattern_ops);

GRANT INSERT (medicamento_texto, presentacion_texto) ON recetas_detalle TO sjlc_app;
