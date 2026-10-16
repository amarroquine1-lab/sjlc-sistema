-- 025: eliminar usuarios que sí tienen actividad.
-- Quien nunca tuvo actividad se borra de verdad (migración 024). Quien la tiene NO se puede borrar sin perder el nombre
-- en atenciones, recetas, bitácora, etc.: se marca como eliminado (eliminado_el). Un usuario eliminado desaparece de la
-- lista, no puede ingresar, no se puede modificar ni reactivar (ni siquiera por el dueño de la base) y conserva su fila,
-- así que su nombre sigue apareciendo en todos los registros donde figura. Su nombre de usuario queda reservado.
-- Las reglas de quién puede eliminarse (no uno mismo, no "sistema", no el último administrador activo) se validan aquí.

ALTER TABLE usuarios ADD COLUMN eliminado_el timestamptz NULL;
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_eliminado_inactivo CHECK (eliminado_el IS NULL OR NOT activo);
GRANT UPDATE (eliminado_el) ON usuarios TO sjlc_app;

CREATE FUNCTION public.validar_eliminacion_logica_usuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_texto_actor  text := current_setting('sjlc.id_usuario', true);
BEGIN
    -- Un usuario eliminado no se modifica ni se reactiva: nadie, tampoco el dueño de la base.
    IF OLD.eliminado_el IS NOT NULL THEN
        RAISE EXCEPTION 'Este usuario fue eliminado y no se puede modificar ni reactivar.' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.eliminado_el IS NOT NULL THEN
        IF OLD.nombre_usuario = 'sistema' THEN
            RAISE EXCEPTION 'La cuenta del sistema no se elimina.' USING ERRCODE = 'restrict_violation';
        END IF;
        IF v_texto_actor ~ '^[0-9]{1,9}$' AND v_texto_actor::integer = OLD.id_usuario THEN
            RAISE EXCEPTION 'No puede eliminar su propia cuenta.' USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.activo
           AND (SELECT nombre_rol FROM roles WHERE id_rol = OLD.id_rol) = 'administrador'
           AND NOT EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                            WHERE u.activo AND r.nombre_rol = 'administrador' AND u.id_usuario <> OLD.id_usuario) THEN
            RAISE EXCEPTION 'No se puede eliminar al último administrador activo.' USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.activo THEN
            RAISE EXCEPTION 'Un usuario eliminado queda desactivado.' USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.validar_eliminacion_logica_usuario() FROM PUBLIC;
-- Se llama "trg_usuarios_a_..." para que dispare antes que los demás triggers de usuarios (orden alfabético).
CREATE TRIGGER trg_usuarios_a_eliminacion_logica BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION public.validar_eliminacion_logica_usuario();

-- La bitácora anota la eliminación lógica con la misma acción "eliminar" que el borrado completo.
CREATE OR REPLACE FUNCTION public.registrar_bitacora()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_texto_usuario  text := current_setting('sjlc.id_usuario', true);
    v_texto_ip       text := current_setting('sjlc.direccion_ip', true);
    v_id_usuario     integer;
    v_ip             inet;
    v_anterior       jsonb;
    v_nuevo          jsonb;
BEGIN
    IF v_texto_usuario ~ '^[0-9]{1,9}$' THEN
        v_id_usuario := v_texto_usuario::integer;
    ELSIF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RAISE EXCEPTION 'Operación rechazada: no se identificó al usuario de la sesión para registrar el cambio en %.', TG_TABLE_NAME
            USING HINT = 'La transacción debe fijar sjlc.id_usuario con el id numérico del usuario.';
    END IF;

    IF coalesce(v_texto_ip, '') <> '' THEN
        BEGIN
            v_ip := v_texto_ip::inet;
        EXCEPTION WHEN invalid_text_representation THEN
            v_ip := NULL;
        END;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_anterior := to_jsonb(OLD);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevo := to_jsonb(NEW);
    END IF;

    -- El hash de la contraseña nunca se copia a la bitácora; solo se anota que cambió.
    IF TG_TABLE_NAME = 'usuarios' THEN
        IF TG_OP = 'UPDATE' AND (v_anterior -> 'contrasena_hash') IS DISTINCT FROM (v_nuevo -> 'contrasena_hash') THEN
            v_nuevo := v_nuevo || jsonb_build_object('contrasena_cambiada', true);
        END IF;
        v_anterior := v_anterior - 'contrasena_hash';
        v_nuevo := v_nuevo - 'contrasena_hash';

        -- El ingreso y el bloqueo quedan como eventos propios (inicio_sesion, bloqueo_cuenta...).
        IF TG_OP = 'UPDATE'
           AND (v_anterior - ARRAY['ultimo_ingreso', 'intentos_fallidos', 'bloqueado_hasta'])
             = (v_nuevo - ARRAY['ultimo_ingreso', 'intentos_fallidos', 'bloqueado_hasta']) THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Un UPDATE que no cambia nada no se anota.
    IF TG_OP = 'UPDATE' AND v_anterior = v_nuevo THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.bitacora (id_usuario, accion, entidad, id_registro, direccion_ip, valor_anterior, valor_nuevo)
    VALUES (
        v_id_usuario,
        -- Quitar del sistema a un usuario con actividad (eliminado_el pasa de nulo a una fecha) también es una eliminación.
        CASE TG_OP WHEN 'INSERT' THEN 'crear'
                   WHEN 'UPDATE' THEN CASE WHEN TG_TABLE_NAME = 'usuarios' AND (v_anterior ->> 'eliminado_el') IS NULL AND (v_nuevo ->> 'eliminado_el') IS NOT NULL THEN 'eliminar' ELSE 'editar' END
                   ELSE 'eliminar' END,
        TG_TABLE_NAME,
        (coalesce(v_nuevo, v_anterior) ->> TG_ARGV[0])::bigint,
        v_ip,
        v_anterior,
        v_nuevo
    );
    RETURN NULL;
END
$function$;
