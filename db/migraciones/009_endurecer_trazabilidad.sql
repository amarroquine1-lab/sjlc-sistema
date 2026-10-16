-- 009: endurece la trazabilidad (hallazgos S-01, S-02, S-10 y S-11 de la revisión de la Fase 3).
--  a) S-11: la bitácora automática exime solo al dueño de la tabla (no a un nombre de rol fijo)
--     y ya no anota los UPDATE de usuarios que solo tocan datos del ingreso.
--  b) S-01: las inserciones directas en la bitácora solo admiten las acciones propias del
--     backend y el usuario de la sesión.
--  c) S-02: quién puede crear usuarios y cambiar rol, estado, contraseña y datos de ingreso.
--  d) S-10: estados finales de la atención, unión de pacientes y horas futuras.
--  e) Índice para el límite de intentos fallidos por IP.
-- El dueño de cada tabla (migraciones y seeds) queda exento de estas reglas.
-- Los rechazos por permiso usan SQLSTATE 42501 (insufficient_privilege) y los de
-- trazabilidad 23001 (restrict_violation), como en 007.

-- a) Bitácora automática ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_bitacora()
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

-- b) Inserciones directas en la bitácora ----------------------------------------------
-- Solo se revisan las que hace el backend (profundidad de trigger 1); las de
-- registrar_bitacora() ya vienen controladas. Cada fase que necesite una acción nueva
-- la agrega reemplazando esta función en una migración.

CREATE FUNCTION public.validar_bitacora_directa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    -- crear, editar y eliminar quedan reservadas a registrar_bitacora().
    v_acciones_permitidas  constant text[] := ARRAY[
        'inicio_sesion', 'inicio_sesion_fallido', 'cierre_sesion', 'sesion_expirada',
        'cambio_contrasena', 'restablecer_contrasena', 'bloqueo_cuenta', 'desbloqueo_cuenta',
        'acceso_denegado', 'ver_historial', 'unir'
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

CREATE TRIGGER trg_bitacora_validar_directa BEFORE INSERT ON bitacora FOR EACH ROW EXECUTE FUNCTION public.validar_bitacora_directa();

-- c) Cambios en usuarios ------------------------------------------------------------
-- Actor = sjlc.id_usuario, que debe ser un usuario activo.
--   Crear: administrador activo.
--   id_rol, activo, nombre_usuario, nombres, apellidos (y cualquier otra columna que no
--   sea de contraseña ni de ingreso): administrador activo, nunca sobre sí mismo.
--   contrasena_hash, debe_cambiar_contrasena: el propio usuario o un administrador activo;
--   quitar debe_cambiar_contrasena exige un hash nuevo en el mismo UPDATE.
--   intentos_fallidos, bloqueado_hasta, ultimo_ingreso: el propio usuario o un administrador activo.
--   Nunca quedar sin administradores activos.

CREATE FUNCTION public.validar_cambio_usuarios()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_columnas_contrasena  constant text[] := ARRAY['contrasena_hash', 'debe_cambiar_contrasena'];
    v_columnas_ingreso     constant text[] := ARRAY['intentos_fallidos', 'bloqueado_hasta', 'ultimo_ingreso'];
    v_texto_actor          text := current_setting('sjlc.id_usuario', true);
    v_id_actor             integer;
    v_actor_es_admin       boolean;
    v_cambiadas            text[];
    v_era_admin_activo     boolean;
    v_sera_admin_activo    boolean;
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;

    IF v_texto_actor ~ '^[0-9]{1,9}$' THEN
        v_id_actor := v_texto_actor::integer;
    END IF;

    SELECT r.nombre_rol = 'administrador'
      INTO v_actor_es_admin
      FROM usuarios u
      JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = v_id_actor
       AND u.activo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Operación rechazada: no se identificó a un usuario activo que respalde el cambio en usuarios.'
            USING ERRCODE = 'insufficient_privilege',
                  HINT = 'La transacción debe fijar sjlc.id_usuario con el id de un usuario activo.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NOT v_actor_es_admin THEN
            RAISE EXCEPTION 'Solo un administrador activo puede crear usuarios.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    SELECT coalesce(array_agg(n.key), '{}')
      INTO v_cambiadas
      FROM jsonb_each(to_jsonb(NEW)) n
      JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
     WHERE n.value IS DISTINCT FROM o.value;

    IF EXISTS (SELECT 1 FROM unnest(v_cambiadas) c
                WHERE c <> ALL (v_columnas_contrasena || v_columnas_ingreso)) THEN
        IF NOT v_actor_es_admin THEN
            RAISE EXCEPTION 'Solo un administrador activo puede cambiar el rol, el estado, el nombre de usuario, los nombres o los apellidos de un usuario.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF v_id_actor = OLD.id_usuario THEN
            RAISE EXCEPTION 'Un administrador no puede cambiar su propio rol, estado, nombre de usuario, nombres ni apellidos. Debe hacerlo otro administrador.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    IF v_cambiadas && v_columnas_contrasena THEN
        IF NOT (v_actor_es_admin OR v_id_actor = OLD.id_usuario) THEN
            RAISE EXCEPTION 'Solo el propio usuario o un administrador activo puede cambiar la contraseña.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.debe_cambiar_contrasena AND NOT NEW.debe_cambiar_contrasena
           AND NEW.contrasena_hash IS NOT DISTINCT FROM OLD.contrasena_hash THEN
            RAISE EXCEPTION 'Para quitar la obligación de cambiar la contraseña se debe guardar una contraseña nueva en la misma operación.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    IF v_cambiadas && v_columnas_ingreso THEN
        IF NOT (v_actor_es_admin OR v_id_actor = OLD.id_usuario) THEN
            RAISE EXCEPTION 'Solo el propio usuario o un administrador activo puede cambiar los intentos fallidos, el bloqueo o el último ingreso.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- Último administrador activo. Se bloquean las filas de los demás administradores
    -- para que dos cambios simultáneos no los desactiven a todos.
    v_era_admin_activo := OLD.activo AND EXISTS (SELECT 1 FROM roles WHERE id_rol = OLD.id_rol AND nombre_rol = 'administrador');
    v_sera_admin_activo := NEW.activo AND EXISTS (SELECT 1 FROM roles WHERE id_rol = NEW.id_rol AND nombre_rol = 'administrador');
    IF v_era_admin_activo AND NOT v_sera_admin_activo THEN
        PERFORM 1
           FROM usuarios u
           JOIN roles r ON r.id_rol = u.id_rol
          WHERE r.nombre_rol = 'administrador'
            AND u.activo
            AND u.id_usuario <> OLD.id_usuario
            FOR NO KEY UPDATE OF u;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No se puede desactivar ni cambiar de rol al último administrador activo del sistema.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    RETURN NEW;
END
$$;

CREATE TRIGGER trg_usuarios_validar_cambio BEFORE INSERT OR UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION public.validar_cambio_usuarios();

-- d) Reglas de trazabilidad (S-10) ----------------------------------------------------

-- Una atención cerrada (finalizada, se retiró, no concluida) no cambia de estado.
CREATE FUNCTION public.bloquear_reapertura_atencion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;
    IF OLD.estado IN ('finalizada', 'se_retiro', 'no_concluida')
       AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        RAISE EXCEPTION 'La atención % ya está cerrada (%) y no puede cambiar de estado.', OLD.numero_atencion, OLD.estado
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_atenciones_bloquear_reapertura BEFORE UPDATE ON atenciones FOR EACH ROW EXECUTE FUNCTION public.bloquear_reapertura_atencion();

-- Un paciente unido a otro no se "desune" ni se reasigna.
CREATE FUNCTION public.bloquear_cambio_paciente_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;
    IF OLD.id_paciente_principal IS NOT NULL
       AND NEW.id_paciente_principal IS DISTINCT FROM OLD.id_paciente_principal THEN
        RAISE EXCEPTION 'El paciente % ya fue unido a otro registro; la unión no se cambia ni se deshace.', OLD.codigo_paciente
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_pacientes_bloquear_cambio_principal BEFORE UPDATE ON pacientes FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_paciente_principal();

-- id_paciente_principal solo con su fila en uniones_pacientes (se revisa al confirmar,
-- así la unión y el paciente se pueden escribir en cualquier orden dentro de la transacción).
CREATE FUNCTION public.verificar_union_paciente_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NULL;
    END IF;
    IF NEW.id_paciente_principal IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.id_paciente_principal IS NOT DISTINCT FROM OLD.id_paciente_principal) THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM uniones_pacientes
                    WHERE id_paciente = NEW.id_paciente_principal
                      AND id_paciente_unido = NEW.id_paciente) THEN
        RAISE EXCEPTION 'El paciente % no se puede marcar como unido sin registrar la unión (motivo y datos) en uniones_pacientes.', NEW.codigo_paciente
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER trg_pacientes_verificar_union
    AFTER INSERT OR UPDATE OF id_paciente_principal ON pacientes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.verificar_union_paciente_principal();

-- Horas que no pueden estar en el futuro (más de 1 minuto de tolerancia por relojes).
-- Argumentos: columnas timestamptz a revisar. En UPDATE solo se revisan las que cambian.
CREATE FUNCTION public.rechazar_horas_futuras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_nuevo     jsonb := to_jsonb(NEW);
    v_anterior  jsonb;
    v_columna   text;
    v_hora      timestamptz;
BEGIN
    IF current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        v_anterior := to_jsonb(OLD);
    END IF;
    FOREACH v_columna IN ARRAY TG_ARGV LOOP
        IF v_anterior IS NOT NULL AND (v_nuevo -> v_columna) IS NOT DISTINCT FROM (v_anterior -> v_columna) THEN
            CONTINUE;
        END IF;
        v_hora := (v_nuevo ->> v_columna)::timestamptz;
        IF v_hora > now() + interval '1 minute' THEN
            RAISE EXCEPTION 'La hora % de % (%) está en el futuro. Las horas se registran al momento en que ocurren.', v_columna, TG_TABLE_NAME, v_hora
                USING ERRCODE = 'restrict_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_recorridos_atencion_horas_futuras BEFORE INSERT OR UPDATE ON recorridos_atencion
    FOR EACH ROW EXECUTE FUNCTION public.rechazar_horas_futuras('fecha_hora_entrada', 'fecha_hora_inicio', 'fecha_hora_salida');
CREATE TRIGGER trg_atenciones_horas_futuras BEFORE INSERT OR UPDATE ON atenciones
    FOR EACH ROW EXECUTE FUNCTION public.rechazar_horas_futuras('fecha_hora_cierre');

-- e) Límite de intentos fallidos por IP -----------------------------------------------

CREATE INDEX ix_bitacora_ip_fallidos ON bitacora (direccion_ip, fecha_hora)
    WHERE accion = 'inicio_sesion_fallido';

-- Permisos ------------------------------------------------------------------------------
-- Las funciones nuevas solo se disparan por trigger: nadie las llama directo.
-- No se conceden privilegios nuevos: las reglas usan SELECT en usuarios, roles y
-- uniones_pacientes, y el bloqueo de filas de usuarios, que sjlc_app ya tiene (008).

REVOKE EXECUTE ON FUNCTION public.validar_bitacora_directa() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validar_cambio_usuarios() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bloquear_reapertura_atencion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bloquear_cambio_paciente_principal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_union_paciente_principal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rechazar_horas_futuras() FROM PUBLIC;
