-- 011 (PROVISIONAL, P19 y P20): cobertura de zona 10 de Mixco.
-- La lista real de colonias y sectores la entrega la coordinadora: la tabla nace vacía y la administra
-- el administrador. Las columnas nuevas de pacientes son opcionales.

CREATE TABLE colonias_sectores (
    id_colonia_sector      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_municipio           smallint NOT NULL REFERENCES municipios (id_municipio),
    zona                   smallint NOT NULL CHECK (zona > 0),
    nombre_colonia_sector  text NOT NULL CHECK (length(btrim(nombre_colonia_sector)) > 0),
    -- Sector del territorio del centro, si existe.
    sector_centro          text NULL,
    activo                 boolean NOT NULL DEFAULT true,
    fecha_creacion         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_municipio, zona, nombre_colonia_sector)
);

ALTER TABLE pacientes
    ADD COLUMN zona_residencia    smallint NULL CHECK (zona_residencia > 0),
    ADD COLUMN id_colonia_sector  smallint NULL REFERENCES colonias_sectores (id_colonia_sector);

CREATE INDEX ix_pacientes_id_colonia_sector ON pacientes (id_colonia_sector) WHERE id_colonia_sector IS NOT NULL;

CREATE TRIGGER trg_colonias_sectores_bloquear_borrado BEFORE DELETE ON colonias_sectores FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_colonias_sectores_bloquear_vaciado BEFORE TRUNCATE ON colonias_sectores FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_colonias_sectores_bitacora AFTER INSERT OR UPDATE OR DELETE ON colonias_sectores FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_colonia_sector');

-- Permisos: la aplicación lee y administra la lista; en pacientes puede fijar las columnas nuevas.
GRANT SELECT ON colonias_sectores TO sjlc_app;
GRANT INSERT (id_municipio, zona, nombre_colonia_sector, sector_centro) ON colonias_sectores TO sjlc_app;
GRANT UPDATE (nombre_colonia_sector, sector_centro, activo) ON colonias_sectores TO sjlc_app;
GRANT INSERT (zona_residencia, id_colonia_sector) ON pacientes TO sjlc_app;
GRANT UPDATE (zona_residencia, id_colonia_sector) ON pacientes TO sjlc_app;
