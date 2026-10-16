-- 021: el nombre de la vacuna se escribe en texto libre (como la receta). El catálogo deja de ser obligatorio:
-- id_vacuna queda como vínculo opcional y las vacunas ya registradas conservan su nombre.

ALTER TABLE vacunas_aplicadas ADD COLUMN nombre_vacuna_texto text;

-- Carga única del nombre ya registrado, hecha por el dueño de la base (el registro de vacunas no admite ediciones).
ALTER TABLE vacunas_aplicadas DISABLE TRIGGER USER;
UPDATE vacunas_aplicadas v SET nombre_vacuna_texto = va.nombre_vacuna FROM vacunas va WHERE va.id_vacuna = v.id_vacuna;
ALTER TABLE vacunas_aplicadas ENABLE TRIGGER USER;

ALTER TABLE vacunas_aplicadas ALTER COLUMN nombre_vacuna_texto SET NOT NULL;
ALTER TABLE vacunas_aplicadas ALTER COLUMN id_vacuna DROP NOT NULL;
ALTER TABLE vacunas_aplicadas ADD CONSTRAINT ck_vacunas_aplicadas_nombre_texto CHECK (length(trim(nombre_vacuna_texto)) BETWEEN 1 AND 120);

-- Si alguien inserta con una vacuna del catálogo y sin texto (seeds y datos viejos), el nombre se toma del catálogo.
CREATE FUNCTION public.completar_vacuna_texto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.nombre_vacuna_texto IS NULL AND NEW.id_vacuna IS NOT NULL THEN
        SELECT nombre_vacuna INTO NEW.nombre_vacuna_texto FROM public.vacunas WHERE id_vacuna = NEW.id_vacuna;
    END IF;
    RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.completar_vacuna_texto() FROM PUBLIC;
CREATE TRIGGER trg_vacunas_aplicadas_completar_texto BEFORE INSERT ON vacunas_aplicadas FOR EACH ROW EXECUTE FUNCTION public.completar_vacuna_texto();

-- La misma dosis no se repite en una atención, comparando el nombre sin mayúsculas, tildes ni espacios sobrantes.
DROP INDEX ux_vacunas_aplicadas_vigente;
CREATE UNIQUE INDEX ux_vacunas_aplicadas_vigente ON vacunas_aplicadas (id_atencion, (public.unaccent_inmutable(lower(trim(nombre_vacuna_texto)))), numero_dosis) WHERE vigente;

-- Para sugerir lo ya escrito antes
CREATE INDEX ix_vacunas_aplicadas_nombre_texto ON vacunas_aplicadas (public.unaccent_inmutable(lower(nombre_vacuna_texto)) text_pattern_ops);

GRANT INSERT (nombre_vacuna_texto) ON vacunas_aplicadas TO sjlc_app;
