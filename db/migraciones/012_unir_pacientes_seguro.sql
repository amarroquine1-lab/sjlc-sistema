-- 012: la unión de pacientes no puede formar ciclos ni cadenas, y un registro absorbido no recibe atenciones nuevas.
-- (Revisión de seguridad de la Fase 6, U-02.)

-- Quien absorbe no puede estar absorbido, y quien es absorbido no puede ser a su vez principal de otros.
CREATE FUNCTION public.impedir_union_encadenada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;
    IF NEW.id_paciente_principal IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM pacientes WHERE id_paciente = NEW.id_paciente_principal AND id_paciente_principal IS NOT NULL) THEN
            RAISE EXCEPTION 'El registro principal ya fue unido a otro; no se pueden encadenar uniones.'
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM pacientes WHERE id_paciente_principal = NEW.id_paciente) THEN
            RAISE EXCEPTION 'Este registro ya conserva a otros unidos; no se puede unir a otro.'
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_pacientes_impedir_union_encadenada BEFORE UPDATE OF id_paciente_principal ON pacientes
    FOR EACH ROW EXECUTE FUNCTION public.impedir_union_encadenada();

-- No se abren atenciones sobre un registro ya unido a otro.
CREATE FUNCTION public.impedir_atencion_a_unido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM pacientes WHERE id_paciente = NEW.id_paciente AND id_paciente_principal IS NOT NULL) THEN
        RAISE EXCEPTION 'El paciente ya fue unido a otro registro: la atención se abre en el registro vigente.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_atenciones_impedir_a_unido BEFORE INSERT ON atenciones
    FOR EACH ROW EXECUTE FUNCTION public.impedir_atencion_a_unido();

REVOKE EXECUTE ON FUNCTION public.impedir_union_encadenada() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.impedir_atencion_a_unido() FROM PUBLIC;
