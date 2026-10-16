-- 007: reglas que protegen la trazabilidad.
--  a) Nada se borra (solo pacientes_encargados admite DELETE). TRUNCATE bloqueado en todas.
--  b) Registros clínicos: solo se permite pasar vigente de true a false.
--     Detalles, diagnósticos, uniones y bitácora: ningún UPDATE.
--  c) Bitácora automática de cambios. Si escribe sjlc_app sin sjlc.id_usuario, se rechaza.
-- Los bloqueos devuelven SQLSTATE 23001 (restrict_violation) para que el backend los distinga.

-- a) Bloqueo de borrado ------------------------------------------------------

CREATE FUNCTION public.bloquear_borrado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'No se permite borrar datos de la tabla %. Los registros se desactivan o se corrigen con una versión nueva.', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER trg_areas_bloquear_borrado BEFORE DELETE ON areas FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_roles_bloquear_borrado BEFORE DELETE ON roles FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_tipos_atencion_bloquear_borrado BEFORE DELETE ON tipos_atencion FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_pueblos_bloquear_borrado BEFORE DELETE ON pueblos FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_comunidades_linguisticas_bloquear_borrado BEFORE DELETE ON comunidades_linguisticas FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_departamentos_bloquear_borrado BEFORE DELETE ON departamentos FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_municipios_bloquear_borrado BEFORE DELETE ON municipios FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_presentaciones_bloquear_borrado BEFORE DELETE ON presentaciones FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_medicamentos_bloquear_borrado BEFORE DELETE ON medicamentos FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_usuarios_bloquear_borrado BEFORE DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_bitacora_bloquear_borrado BEFORE DELETE ON bitacora FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_pacientes_bloquear_borrado BEFORE DELETE ON pacientes FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_encargados_bloquear_borrado BEFORE DELETE ON encargados FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_uniones_pacientes_bloquear_borrado BEFORE DELETE ON uniones_pacientes FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_atenciones_bloquear_borrado BEFORE DELETE ON atenciones FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recorridos_atencion_bloquear_borrado BEFORE DELETE ON recorridos_atencion FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_proximos_controles_bloquear_borrado BEFORE DELETE ON proximos_controles FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_signos_vitales_bloquear_borrado BEFORE DELETE ON signos_vitales FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_consultas_bloquear_borrado BEFORE DELETE ON consultas FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_diagnosticos_consulta_bloquear_borrado BEFORE DELETE ON diagnosticos_consulta FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recetas_bloquear_borrado BEFORE DELETE ON recetas FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recetas_detalle_bloquear_borrado BEFORE DELETE ON recetas_detalle FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado();

-- TRUNCATE no dispara triggers por fila: se bloquea aparte en todas las tablas,
-- incluida pacientes_encargados (sus borrados deben quedar en bitácora uno por uno).
CREATE TRIGGER trg_areas_bloquear_vaciado BEFORE TRUNCATE ON areas FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_roles_bloquear_vaciado BEFORE TRUNCATE ON roles FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_tipos_atencion_bloquear_vaciado BEFORE TRUNCATE ON tipos_atencion FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_pueblos_bloquear_vaciado BEFORE TRUNCATE ON pueblos FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_comunidades_linguisticas_bloquear_vaciado BEFORE TRUNCATE ON comunidades_linguisticas FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_departamentos_bloquear_vaciado BEFORE TRUNCATE ON departamentos FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_municipios_bloquear_vaciado BEFORE TRUNCATE ON municipios FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_presentaciones_bloquear_vaciado BEFORE TRUNCATE ON presentaciones FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_medicamentos_bloquear_vaciado BEFORE TRUNCATE ON medicamentos FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_usuarios_bloquear_vaciado BEFORE TRUNCATE ON usuarios FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_bitacora_bloquear_vaciado BEFORE TRUNCATE ON bitacora FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_pacientes_bloquear_vaciado BEFORE TRUNCATE ON pacientes FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_encargados_bloquear_vaciado BEFORE TRUNCATE ON encargados FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_pacientes_encargados_bloquear_vaciado BEFORE TRUNCATE ON pacientes_encargados FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_uniones_pacientes_bloquear_vaciado BEFORE TRUNCATE ON uniones_pacientes FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_atenciones_bloquear_vaciado BEFORE TRUNCATE ON atenciones FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recorridos_atencion_bloquear_vaciado BEFORE TRUNCATE ON recorridos_atencion FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_proximos_controles_bloquear_vaciado BEFORE TRUNCATE ON proximos_controles FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_signos_vitales_bloquear_vaciado BEFORE TRUNCATE ON signos_vitales FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_consultas_bloquear_vaciado BEFORE TRUNCATE ON consultas FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_diagnosticos_consulta_bloquear_vaciado BEFORE TRUNCATE ON diagnosticos_consulta FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recetas_bloquear_vaciado BEFORE TRUNCATE ON recetas FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();
CREATE TRIGGER trg_recetas_detalle_bloquear_vaciado BEFORE TRUNCATE ON recetas_detalle FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_borrado();

-- b) Bloqueo de UPDATE indebido -----------------------------------------------

-- Solo deja pasar vigente de true a false sin tocar ninguna otra columna.
CREATE FUNCTION public.permitir_solo_desactivar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.vigente AND NOT NEW.vigente
       AND (to_jsonb(NEW) - 'vigente') = (to_jsonb(OLD) - 'vigente') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Los registros de % no se modifican. Para corregir, marque el registro como no vigente e inserte uno nuevo con corrige_a.', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE FUNCTION public.bloquear_modificacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'Los registros de % no se modifican una vez guardados.', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER trg_signos_vitales_solo_desactivar BEFORE UPDATE ON signos_vitales FOR EACH ROW EXECUTE FUNCTION public.permitir_solo_desactivar();
CREATE TRIGGER trg_consultas_solo_desactivar BEFORE UPDATE ON consultas FOR EACH ROW EXECUTE FUNCTION public.permitir_solo_desactivar();
CREATE TRIGGER trg_recetas_solo_desactivar BEFORE UPDATE ON recetas FOR EACH ROW EXECUTE FUNCTION public.permitir_solo_desactivar();

CREATE TRIGGER trg_recetas_detalle_bloquear_modificacion BEFORE UPDATE ON recetas_detalle FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();
CREATE TRIGGER trg_diagnosticos_consulta_bloquear_modificacion BEFORE UPDATE ON diagnosticos_consulta FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();
CREATE TRIGGER trg_bitacora_bloquear_modificacion BEFORE UPDATE ON bitacora FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();
CREATE TRIGGER trg_uniones_pacientes_bloquear_modificacion BEFORE UPDATE ON uniones_pacientes FOR EACH ROW EXECUTE FUNCTION public.bloquear_modificacion();

-- c) Bitácora automática ------------------------------------------------------
-- El backend fija en cada transacción de escritura:
--   set_config('sjlc.id_usuario', <id>, true) y set_config('sjlc.direccion_ip', <ip>, true)
-- Argumento del trigger: nombre de la columna que se guarda como id_registro.
-- Migraciones y seeds (dueño de la base) quedan exentos y registran id_usuario nulo.

CREATE FUNCTION public.registrar_bitacora()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
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
    ELSIF current_user = 'sjlc_app' THEN
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
    END IF;

    -- Un UPDATE que no cambia nada no se anota.
    IF TG_OP = 'UPDATE' AND v_anterior = v_nuevo THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.bitacora (id_usuario, accion, entidad, id_registro, direccion_ip, valor_anterior, valor_nuevo)
    VALUES (
        v_id_usuario,
        CASE TG_OP WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'editar' ELSE 'eliminar' END,
        TG_TABLE_NAME,
        (coalesce(v_nuevo, v_anterior) ->> TG_ARGV[0])::bigint,
        v_ip,
        v_anterior,
        v_nuevo
    );
    RETURN NULL;
END
$$;

CREATE TRIGGER trg_usuarios_bitacora AFTER INSERT OR UPDATE OR DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_usuario');
CREATE TRIGGER trg_pacientes_bitacora AFTER INSERT OR UPDATE OR DELETE ON pacientes FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_paciente');
CREATE TRIGGER trg_encargados_bitacora AFTER INSERT OR UPDATE OR DELETE ON encargados FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_encargado');
-- Llave compuesta: se anota el paciente; el encargado queda en los jsonb.
CREATE TRIGGER trg_pacientes_encargados_bitacora AFTER INSERT OR UPDATE OR DELETE ON pacientes_encargados FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_paciente');
CREATE TRIGGER trg_uniones_pacientes_bitacora AFTER INSERT OR UPDATE OR DELETE ON uniones_pacientes FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_union_paciente');
CREATE TRIGGER trg_atenciones_bitacora AFTER INSERT OR UPDATE OR DELETE ON atenciones FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_atencion');
CREATE TRIGGER trg_recorridos_atencion_bitacora AFTER INSERT OR UPDATE OR DELETE ON recorridos_atencion FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_recorrido_atencion');
CREATE TRIGGER trg_proximos_controles_bitacora AFTER INSERT OR UPDATE OR DELETE ON proximos_controles FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_proximo_control');
CREATE TRIGGER trg_signos_vitales_bitacora AFTER INSERT OR UPDATE OR DELETE ON signos_vitales FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_signo_vital');
CREATE TRIGGER trg_consultas_bitacora AFTER INSERT OR UPDATE OR DELETE ON consultas FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_consulta');
CREATE TRIGGER trg_diagnosticos_consulta_bitacora AFTER INSERT OR UPDATE OR DELETE ON diagnosticos_consulta FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_diagnostico_consulta');
CREATE TRIGGER trg_recetas_bitacora AFTER INSERT OR UPDATE OR DELETE ON recetas FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_receta');
CREATE TRIGGER trg_recetas_detalle_bitacora AFTER INSERT OR UPDATE OR DELETE ON recetas_detalle FOR EACH ROW EXECUTE FUNCTION public.registrar_bitacora('id_receta_detalle');
