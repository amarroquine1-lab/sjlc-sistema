-- 013: integridad de la cola (revisión de seguridad de la Fase 7: V-02, V-03, V-09).

-- V-02: una atención que pasa a un estado final nunca deja un tramo abierto (aunque otra sesión
-- haya enviado al paciente a otra área justo antes del cierre).
CREATE FUNCTION public.cerrar_tramos_al_finalizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.estado IN ('finalizada', 'se_retiro', 'no_concluida') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        UPDATE public.recorridos_atencion SET fecha_hora_salida = now() WHERE id_atencion = NEW.id_atencion AND fecha_hora_salida IS NULL;
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER trg_atenciones_cerrar_tramos AFTER UPDATE OF estado ON atenciones
    FOR EACH ROW EXECUTE FUNCTION public.cerrar_tramos_al_finalizar();
REVOKE EXECUTE ON FUNCTION public.cerrar_tramos_al_finalizar() FROM PUBLIC;

-- Limpia lo que haya quedado abierto antes de esta migración
UPDATE recorridos_atencion r SET fecha_hora_salida = now() FROM atenciones a
 WHERE a.id_atencion = r.id_atencion AND r.fecha_hora_salida IS NULL AND a.estado IN ('finalizada', 'se_retiro', 'no_concluida');

-- V-03: la cuenta "sistema" no se activa, no cambia de rol ni de contraseña por la aplicación.
CREATE FUNCTION public.proteger_usuario_sistema()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.nombre_usuario = 'sistema'
       AND current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
       AND (NEW.activo IS DISTINCT FROM OLD.activo OR NEW.contrasena_hash IS DISTINCT FROM OLD.contrasena_hash
            OR NEW.debe_cambiar_contrasena IS DISTINCT FROM OLD.debe_cambiar_contrasena OR NEW.id_rol IS DISTINCT FROM OLD.id_rol
            OR NEW.nombre_usuario IS DISTINCT FROM OLD.nombre_usuario OR NEW.nombres IS DISTINCT FROM OLD.nombres
            OR NEW.apellidos IS DISTINCT FROM OLD.apellidos) THEN
        RAISE EXCEPTION 'La cuenta del sistema no se modifica desde la aplicación.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_usuarios_proteger_sistema BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION public.proteger_usuario_sistema();
REVOKE EXECUTE ON FUNCTION public.proteger_usuario_sistema() FROM PUBLIC;

-- V-09: el cierre del día (automático o manual) queda anotado como evento propio.
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
        'acceso_denegado', 'ver_historial', 'unir', 'cierre_dia'
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
