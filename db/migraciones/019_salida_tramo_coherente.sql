-- 019: la hora de salida de un tramo nunca es anterior a su entrada ni a su inicio, aunque otra transacción
-- (que empezó después) haya creado el tramo mientras se cerraba la atención.
CREATE OR REPLACE FUNCTION public.cerrar_tramos_al_finalizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.estado IN ('finalizada', 'se_retiro', 'no_concluida') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        UPDATE public.recorridos_atencion SET fecha_hora_salida = GREATEST(now(), fecha_hora_entrada, coalesce(fecha_hora_inicio, fecha_hora_entrada)) WHERE id_atencion = NEW.id_atencion AND fecha_hora_salida IS NULL;
    END IF;
    RETURN NULL;
END
$$;

