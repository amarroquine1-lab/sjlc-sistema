-- 026: regla de atención por rol.
--  - Administración: un paciente en atención por área al mismo tiempo (nunca dos en la misma área).
--  - Roles operativos: un solo paciente a la vez en cualquier área.
-- El índice único pasa de (usuario) a (usuario, área); la regla "uno solo en cualquier área" para los roles
-- operativos la valida un disparador. Dos doctores siguen sin poder tomar al mismo paciente (un tramo abierto por atención).

DROP INDEX ux_recorridos_usuario_en_atencion;
CREATE UNIQUE INDEX ux_recorridos_usuario_area_en_atencion ON recorridos_atencion (id_usuario, id_area)
    WHERE fecha_hora_inicio IS NOT NULL AND fecha_hora_salida IS NULL;

CREATE FUNCTION public.validar_un_paciente_por_operativo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.fecha_hora_inicio IS NOT NULL AND NEW.fecha_hora_salida IS NULL
       AND NOT EXISTS (SELECT 1 FROM usuarios u JOIN roles r USING (id_rol) WHERE u.id_usuario = NEW.id_usuario AND r.nombre_rol = 'administrador')
       AND EXISTS (SELECT 1 FROM recorridos_atencion o
                    WHERE o.id_usuario = NEW.id_usuario AND o.fecha_hora_inicio IS NOT NULL AND o.fecha_hora_salida IS NULL
                      AND o.id_recorrido_atencion IS DISTINCT FROM NEW.id_recorrido_atencion) THEN
        RAISE EXCEPTION 'Un usuario que no es administrador atiende a un solo paciente a la vez.' USING ERRCODE = '23505', CONSTRAINT = 'ux_recorridos_operativo_un_paciente';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_recorridos_operativo_un_paciente AFTER INSERT OR UPDATE ON recorridos_atencion
    FOR EACH ROW EXECUTE FUNCTION public.validar_un_paciente_por_operativo();

-- La acción devolver_a_cola queda como evento propio en la bitácora (misma función de la 020 con una acción más).
CREATE OR REPLACE FUNCTION public.validar_bitacora_directa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    -- crear, editar y eliminar quedan reservadas a registrar_bitacora().
    v_acciones_permitidas  constant text[] := ARRAY[
        'inicio_sesion', 'inicio_sesion_fallido', 'cierre_sesion', 'sesion_expirada',
        'cambio_contrasena', 'restablecer_contrasena', 'bloqueo_cuenta', 'desbloqueo_cuenta',
        'acceso_denegado', 'ver_historial', 'unir', 'cierre_dia', 'buscar_paciente', 'ver_paciente', 'atender_directo', 'devolver_a_cola'
    ];
    v_texto_usuario        text := current_setting('sjlc.id_usuario', true);
    v_id_sesion            integer;
BEGIN
    IF pg_trigger_depth() <> 1
       OR current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;

    IF NOT coalesce(NEW.accion = ANY (v_acciones_permitidas), false) THEN
        RAISE EXCEPTION 'La acción "%" no se puede escribir directamente en la bitácora. Crear, editar y eliminar los anota la base de datos.', NEW.accion
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_texto_usuario ~ '^[0-9]{1,9}$' THEN
        v_id_sesion := v_texto_usuario::integer;
    END IF;

    IF NEW.accion = 'inicio_sesion_fallido' THEN
        -- Usuario inexistente: sin id, con el nombre que se intentó.
        IF NEW.id_usuario IS NULL THEN
            IF NEW.nombre_usuario_intentado IS NULL THEN
                RAISE EXCEPTION 'Un intento de ingreso fallido sin usuario identificado debe indicar el nombre de usuario intentado.'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            RETURN NEW;
        END IF;
    ELSIF NEW.accion = 'acceso_denegado' THEN
        -- Petición sin sesión: sin id.
        IF NEW.id_usuario IS NULL AND v_id_sesion IS NULL THEN
            RETURN NEW;
        END IF;
    ELSIF v_id_sesion IS NULL THEN
        RAISE EXCEPTION 'Operación rechazada: no se identificó al usuario de la sesión para escribir "%" en la bitácora.', NEW.accion
            USING ERRCODE = 'insufficient_privilege',
                  HINT = 'La transacción debe fijar sjlc.id_usuario con el id numérico del usuario.';
    END IF;

    IF NEW.id_usuario IS DISTINCT FROM v_id_sesion THEN
        RAISE EXCEPTION 'Operación rechazada: el usuario del registro de bitácora no es el usuario de la sesión.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END
$$;


REVOKE EXECUTE ON FUNCTION public.validar_bitacora_directa() FROM PUBLIC;
