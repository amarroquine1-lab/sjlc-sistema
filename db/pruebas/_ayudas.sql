-- Ayudas comunes de las pruebas. probar-bd.sh las antepone a cada archivo NN_*.sql.
-- Solo corren contra una base desechable (sjlc_prueba_*): algunas pruebas mueven secuencias.
\set ON_ERROR_STOP on
SET client_min_messages = notice;

DO $$
BEGIN
    IF current_database() NOT LIKE 'sjlc\_prueba\_%' THEN
        RAISE EXCEPTION 'Estas pruebas solo corren en una base desechable sjlc_prueba_*, no en %', current_database();
    END IF;
END
$$;

CREATE TEMP TABLE resultados (caso text NOT NULL, aprobado boolean NOT NULL, detalle text);

-- Ejecuta una sentencia dentro de una subtransacción que SIEMPRE se revierte.
-- Devuelve 'OK' si la sentencia se aceptó, o 'SQLSTATE: mensaje' si falló.
-- como_app: ejecuta con el rol sjlc_app; id_usuario: fija sjlc.id_usuario (como lo hace el backend).
CREATE FUNCTION pg_temp.ejecutar_prueba(sentencia text, como_app boolean, id_usuario text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
    IF como_app THEN EXECUTE 'SET LOCAL ROLE sjlc_app'; END IF;
    IF id_usuario IS NOT NULL THEN PERFORM set_config('sjlc.id_usuario', id_usuario, true); END IF;
    EXECUTE sentencia;
    RAISE EXCEPTION 'prueba terminada' USING ERRCODE = 'XX999';
EXCEPTION
    WHEN SQLSTATE 'XX999' THEN RETURN 'OK';
    WHEN OTHERS THEN RETURN SQLSTATE || ': ' || SQLERRM;
END
$$;

CREATE FUNCTION pg_temp.registrar(caso text, aprobado boolean, detalle text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO pg_temp.resultados VALUES (caso, aprobado, detalle);
    IF aprobado THEN RAISE NOTICE 'OK: %', caso; ELSE RAISE WARNING 'FALLO: % -- %', caso, detalle; END IF;
END
$$;

-- La sentencia debe fallar con el SQLSTATE indicado (y, si se pide, con un fragmento en el mensaje).
CREATE FUNCTION pg_temp.debe_fallar(sentencia text, codigo text, caso text,
                                    como_app boolean DEFAULT false, id_usuario text DEFAULT NULL,
                                    fragmento text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text := pg_temp.ejecutar_prueba(sentencia, como_app, id_usuario);
BEGIN
    IF r = 'OK' THEN
        PERFORM pg_temp.registrar(caso, false, 'se aceptó una operación que debía fallar con ' || codigo);
    ELSIF left(r, 5) <> codigo THEN
        PERFORM pg_temp.registrar(caso, false, 'esperaba ' || codigo || ' y llegó ' || r);
    ELSIF fragmento IS NOT NULL AND position(fragmento IN r) = 0 THEN
        PERFORM pg_temp.registrar(caso, false, 'el mensaje no contiene "' || fragmento || '": ' || r);
    ELSE
        PERFORM pg_temp.registrar(caso, true);
    END IF;
END
$$;

-- La sentencia debe aceptarse (se revierte después).
CREATE FUNCTION pg_temp.debe_pasar(sentencia text, caso text,
                                   como_app boolean DEFAULT false, id_usuario text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text := pg_temp.ejecutar_prueba(sentencia, como_app, id_usuario);
BEGIN
    PERFORM pg_temp.registrar(caso, r = 'OK', CASE WHEN r = 'OK' THEN NULL ELSE 'falló: ' || r END);
END
$$;

CREATE FUNCTION pg_temp.verificar(condicion boolean, caso text, detalle text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.registrar(caso, coalesce(condicion, false), CASE WHEN coalesce(condicion, false) THEN NULL ELSE coalesce(detalle, 'condición falsa o nula') END);
END
$$;

-- Datos de apoyo (se ejecutan como dueño, dentro de la sentencia de prueba).
CREATE FUNCTION pg_temp.uid(nombre text) RETURNS integer LANGUAGE sql AS
$$ SELECT id_usuario FROM public.usuarios WHERE nombre_usuario = nombre $$;

CREATE FUNCTION pg_temp.nuevo_usuario(p_nombre text, p_rol text DEFAULT 'doctor') RETURNS integer LANGUAGE sql AS
$$ INSERT INTO public.usuarios (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash)
   VALUES (p_nombre, 'Usuario', 'Temporal', (SELECT id_rol FROM public.roles WHERE nombre_rol = p_rol), 'sin-contrasena')
   RETURNING id_usuario $$;

CREATE FUNCTION pg_temp.nuevo_paciente(p_cui text DEFAULT NULL) RETURNS integer LANGUAGE sql AS
$$ INSERT INTO public.pacientes (nombres, apellidos, fecha_nacimiento, sexo, cui, id_usuario)
   VALUES ('Prueba', 'Temporal', DATE '1990-01-01', 'F', p_cui, pg_temp.uid('precepcion'))
   RETURNING id_paciente $$;

CREATE FUNCTION pg_temp.nueva_atencion(p_paciente integer, p_estado text DEFAULT 'en_espera') RETURNS integer LANGUAGE sql AS
$$ INSERT INTO public.atenciones (id_paciente, id_tipo_atencion, estado, id_usuario, fecha_hora_cierre)
   VALUES (p_paciente, (SELECT min(id_tipo_atencion) FROM public.tipos_atencion), p_estado, pg_temp.uid('precepcion'),
           CASE WHEN p_estado IN ('finalizada', 'se_retiro', 'no_concluida') THEN now() END)
   RETURNING id_atencion $$;

CREATE FUNCTION pg_temp.cerrar() RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_total integer; v_fallos integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE NOT aprobado) INTO v_total, v_fallos FROM pg_temp.resultados;
    RAISE NOTICE 'RESUMEN: % casos, % aprobados, % fallidos', v_total, v_total - v_fallos, v_fallos;
    IF v_fallos > 0 THEN RAISE EXCEPTION 'Hay % casos fallidos', v_fallos; END IF;
END
$$;
