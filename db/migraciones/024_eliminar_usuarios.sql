-- 024: eliminar usuarios que nunca tuvieron actividad (por ejemplo, una cuenta creada por error).
-- Hasta ahora ninguna fila de usuarios se podía borrar. Se permite SOLO si el usuario:
--   * nunca ingresó (ultimo_ingreso nulo) y no tiene ninguna fila a su nombre en ninguna tabla que lo referencie
--     (atenciones, pacientes, signos, consultas, recetas, vacunas, entregas, sesiones, bitácora, etc.);
--   * no es la cuenta "sistema", no es quien hace la operación y no es el último administrador activo;
--   * la operación la hace un administrador activo (el dueño de la base también puede, con las mismas reglas).
-- La eliminación queda en la bitácora con el trigger de siempre (acción "eliminar", quién la hizo y los datos del usuario).
-- Quien tiene actividad no se borra nunca: solo se desactiva.

-- ¿Algún registro en alguna tabla apunta a este usuario? Recorre las claves foráneas hacia usuarios, así que
-- cubre también las tablas que se agreguen después.
CREATE FUNCTION public.usuario_tiene_registros(p_id_usuario integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    r record;
    v_hay boolean;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass AS tabla, a.attname AS columna
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confrelid = 'public.usuarios'::regclass
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', r.tabla, r.columna) INTO v_hay USING p_id_usuario;
        IF v_hay THEN
            RETURN true;
        END IF;
    END LOOP;
    RETURN false;
END
$$;
REVOKE EXECUTE ON FUNCTION public.usuario_tiene_registros(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_registros(integer) TO sjlc_app;

CREATE FUNCTION public.validar_eliminacion_usuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_texto_actor  text := current_setting('sjlc.id_usuario', true);
    v_id_actor     integer;
    v_es_dueno     boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
BEGIN
    IF v_texto_actor ~ '^[0-9]{1,9}$' THEN
        v_id_actor := v_texto_actor::integer;
    END IF;

    IF NOT v_es_dueno AND NOT EXISTS (
        SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = v_id_actor AND u.activo AND r.nombre_rol = 'administrador') THEN
        RAISE EXCEPTION 'Solo un administrador activo puede eliminar usuarios.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.nombre_usuario = 'sistema' THEN
        RAISE EXCEPTION 'La cuenta del sistema no se elimina.' USING ERRCODE = 'restrict_violation';
    END IF;
    IF v_id_actor IS NOT NULL AND v_id_actor = OLD.id_usuario THEN
        RAISE EXCEPTION 'No puede eliminar su propia cuenta.' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.ultimo_ingreso IS NOT NULL OR public.usuario_tiene_registros(OLD.id_usuario) THEN
        RAISE EXCEPTION 'Este usuario tiene registros; solo se puede desactivar.' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.activo
       AND (SELECT nombre_rol FROM roles WHERE id_rol = OLD.id_rol) = 'administrador'
       AND NOT EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                        WHERE u.activo AND r.nombre_rol = 'administrador' AND u.id_usuario <> OLD.id_usuario) THEN
        RAISE EXCEPTION 'No se puede eliminar al último administrador activo.' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END
$$;
REVOKE EXECUTE ON FUNCTION public.validar_eliminacion_usuario() FROM PUBLIC;

DROP TRIGGER trg_usuarios_bloquear_borrado ON usuarios;
CREATE TRIGGER trg_usuarios_validar_borrado BEFORE DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION public.validar_eliminacion_usuario();

GRANT DELETE ON usuarios TO sjlc_app;
