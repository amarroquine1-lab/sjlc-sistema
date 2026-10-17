-- 027: tomar la atención de otra persona (solo Administración) queda como evento propio en la bitácora
-- (misma función de la 026 con una acción más).
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
        'acceso_denegado', 'ver_historial', 'unir', 'cierre_dia', 'buscar_paciente', 'ver_paciente', 'atender_directo', 'devolver_a_cola', 'tomar_atencion'
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
