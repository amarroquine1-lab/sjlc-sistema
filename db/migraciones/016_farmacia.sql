-- 016: entrega de medicamentos en farmacia. PROVISIONAL: el formato de numeración y la constancia de recibido
-- dependen de la respuesta de la coordinadora (P10). Los datos del formato de farmacia (paciente, DPI, responsable
-- de la consulta, descripción, presentación) se obtienen por relación con la receta, no se repiten aquí.

-- Número de orden correlativo continuo (no se reinicia); la numeración diaria o anual, si la piden, es un cambio de formato.
CREATE SEQUENCE seq_numero_orden_farmacia AS integer START WITH 1 NO CYCLE;

-- Una entrega por receta: la receta del doctor y la de nutrición se entregan por separado.
CREATE TABLE entregas_farmacia (
    id_entrega_farmacia  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_receta            integer NOT NULL UNIQUE REFERENCES recetas (id_receta),
    numero_orden         integer NOT NULL UNIQUE DEFAULT nextval('seq_numero_orden_farmacia'),
    -- Quién recibió (reemplaza firma o huella del papel).
    recibido_por         text NULL CHECK (length(recibido_por) <= 120),
    id_usuario           integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_hora           timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE seq_numero_orden_farmacia OWNED BY entregas_farmacia.numero_orden;
CREATE INDEX ix_entregas_farmacia_id_usuario ON entregas_farmacia (id_usuario);

CREATE TABLE entregas_farmacia_detalle (
    id_entrega_farmacia_detalle  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_entrega_farmacia          integer NOT NULL REFERENCES entregas_farmacia (id_entrega_farmacia),
    id_receta_detalle            integer NOT NULL UNIQUE REFERENCES recetas_detalle (id_receta_detalle),
    cantidad_entregada           smallint NOT NULL CHECK (cantidad_entregada >= 0),
    cantidad_no_entregada        smallint NOT NULL DEFAULT 0 CHECK (cantidad_no_entregada >= 0),
    observacion                  text NULL CHECK (length(observacion) <= 300),
    -- Si falta algo, se explica por qué.
    CONSTRAINT ck_entregas_detalle_observacion CHECK (cantidad_no_entregada = 0 OR observacion IS NOT NULL)
);
CREATE INDEX ix_entregas_detalle_id_entrega ON entregas_farmacia_detalle (id_entrega_farmacia);

-- Que lo entregado más lo no entregado sea lo recetado, y que la entrega sea de la misma receta.
CREATE FUNCTION public.validar_entrega_detalle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_cantidad  integer;
    v_receta    integer;
BEGIN
    SELECT cantidad_recetada, id_receta INTO v_cantidad, v_receta FROM public.recetas_detalle WHERE id_receta_detalle = NEW.id_receta_detalle;
    IF NEW.cantidad_entregada + NEW.cantidad_no_entregada <> v_cantidad THEN
        RAISE EXCEPTION 'Lo entregado más lo no entregado debe ser igual a la cantidad recetada (%).', v_cantidad USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (SELECT vigente FROM public.recetas WHERE id_receta = v_receta) THEN
        RAISE EXCEPTION 'La receta ya no está vigente.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_receta IS DISTINCT FROM (SELECT id_receta FROM public.entregas_farmacia WHERE id_entrega_farmacia = NEW.id_entrega_farmacia) THEN
        RAISE EXCEPTION 'El renglón no pertenece a la receta de la entrega.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_entregas_detalle_validar BEFORE INSERT ON entregas_farmacia_detalle FOR EACH ROW EXECUTE FUNCTION public.validar_entrega_detalle();
REVOKE EXECUTE ON FUNCTION public.validar_entrega_detalle() FROM PUBLIC;

-- Nada se borra ni se modifica: una entrega es un hecho.
CREATE TRIGGER trg_entregas_bloquear_borrado BEFORE DELETE ON entregas_farmacia FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_entregas_bloquear_vaciado BEFORE TRUNCATE ON entregas_farmacia FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_entregas_bloquear_modificacion BEFORE UPDATE ON entregas_farmacia FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();
CREATE TRIGGER trg_entregas_detalle_bloquear_borrado BEFORE DELETE ON entregas_farmacia_detalle FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_entregas_detalle_bloquear_vaciado BEFORE TRUNCATE ON entregas_farmacia_detalle FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_entregas_detalle_bloquear_modificacion BEFORE UPDATE ON entregas_farmacia_detalle FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();

CREATE TRIGGER trg_entregas_bitacora AFTER INSERT ON entregas_farmacia FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_entrega_farmacia');
CREATE TRIGGER trg_entregas_detalle_bitacora AFTER INSERT ON entregas_farmacia_detalle FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_entrega_farmacia_detalle');

GRANT SELECT ON entregas_farmacia, entregas_farmacia_detalle TO sjlc_app;
GRANT INSERT (id_receta, recibido_por, id_usuario) ON entregas_farmacia TO sjlc_app;
GRANT INSERT (id_entrega_farmacia, id_receta_detalle, cantidad_entregada, cantidad_no_entregada, observacion) ON entregas_farmacia_detalle TO sjlc_app;
GRANT USAGE ON SEQUENCE seq_numero_orden_farmacia TO sjlc_app;
