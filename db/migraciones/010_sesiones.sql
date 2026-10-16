-- 010: sesiones en el servidor. id_sesion es el jti del token: salir, cambiar o
-- restablecer la contraseña, desactivar o cambiar de rol revocan la sesión en el acto.
-- Sin bitácora automática: los eventos (inicio_sesion, cierre_sesion, sesion_expirada...)
-- los escribe el backend.

CREATE TABLE sesiones (
    id_sesion                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario                   integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_hora_inicio            timestamptz NOT NULL DEFAULT now(),
    -- La renueva el backend (como máximo cada 30 s); inactividad = 15 minutos.
    fecha_hora_ultima_actividad  timestamptz NOT NULL DEFAULT now(),
    -- Duración máxima de un turno, aunque haya actividad.
    fecha_hora_vence_absoluta    timestamptz NOT NULL DEFAULT now() + interval '12 hours',
    -- Desde CF-Connecting-IP.
    direccion_ip                 inet NULL,
    -- Recortado por el backend.
    agente_usuario               text NULL CHECK (length(agente_usuario) <= 200),
    revocada_en                  timestamptz NULL,
    motivo_revocacion            text NULL
                                 CHECK (motivo_revocacion IN ('salida', 'inactividad', 'cambio_contrasena',
                                                              'restablecimiento', 'desactivacion', 'cambio_rol',
                                                              'desconocido')),
    fecha_creacion               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_sesiones_revocacion CHECK ((revocada_en IS NULL) = (motivo_revocacion IS NULL))
);

-- Sesiones vigentes de un usuario (para revocarlas todas).
CREATE INDEX ix_sesiones_id_usuario_vigentes ON sesiones (id_usuario) WHERE revocada_en IS NULL;

-- Nada se borra.
CREATE TRIGGER trg_sesiones_bloquear_borrado BEFORE DELETE ON sesiones FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_sesiones_bloquear_vaciado BEFORE TRUNCATE ON sesiones FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();

-- Para quien no es el dueño, un UPDATE solo puede:
--   - adelantar fecha_hora_ultima_actividad (nunca atrás ni en el futuro), en una sesión no revocada;
--   - revocar: revocada_en y motivo_revocacion pasan de nulos a un valor, una sola vez.
CREATE FUNCTION public.validar_cambio_sesiones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - ARRAY['fecha_hora_ultima_actividad', 'revocada_en', 'motivo_revocacion'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['fecha_hora_ultima_actividad', 'revocada_en', 'motivo_revocacion']) THEN
        RAISE EXCEPTION 'De una sesión solo se actualiza la última actividad o su revocación.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.revocada_en IS NOT NULL THEN
        IF NEW.revocada_en IS DISTINCT FROM OLD.revocada_en
           OR NEW.motivo_revocacion IS DISTINCT FROM OLD.motivo_revocacion
           OR NEW.fecha_hora_ultima_actividad IS DISTINCT FROM OLD.fecha_hora_ultima_actividad THEN
            RAISE EXCEPTION 'La sesión ya fue revocada y no se modifica.'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.fecha_hora_ultima_actividad < OLD.fecha_hora_ultima_actividad THEN
        RAISE EXCEPTION 'La última actividad de una sesión no puede retroceder.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.fecha_hora_ultima_actividad > now() + interval '1 minute'
       AND NEW.fecha_hora_ultima_actividad IS DISTINCT FROM OLD.fecha_hora_ultima_actividad THEN
        RAISE EXCEPTION 'La última actividad de una sesión no puede estar en el futuro.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.revocada_en > now() + interval '1 minute' THEN
        RAISE EXCEPTION 'La hora de revocación de una sesión no puede estar en el futuro.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_sesiones_validar_cambio BEFORE UPDATE ON sesiones FOR EACH ROW EXECUTE FUNCTION public.validar_cambio_sesiones();

-- Permisos ------------------------------------------------------------------------------
-- El id, las horas de inicio y de vencimiento los pone la base.

REVOKE EXECUTE ON FUNCTION public.validar_cambio_sesiones() FROM PUBLIC;

GRANT SELECT ON sesiones TO sjlc_app;
GRANT INSERT (id_usuario, direccion_ip, agente_usuario) ON sesiones TO sjlc_app;
GRANT UPDATE (fecha_hora_ultima_actividad, revocada_en, motivo_revocacion) ON sesiones TO sjlc_app;
