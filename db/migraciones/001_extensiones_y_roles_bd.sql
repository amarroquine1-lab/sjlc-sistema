-- 001: extensiones, búsqueda sin tildes, zona horaria y rol de la aplicación.
-- La contraseña de sjlc_app la fija el migrador desde .env; no va en este archivo.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- unaccent() es STABLE y no se puede usar en un índice. Este envoltorio fija el
-- diccionario (queda enlazado al crear la función) y se declara IMMUTABLE.
CREATE FUNCTION public.unaccent_inmutable(texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
    SELECT public.unaccent('public.unaccent'::regdictionary, texto);
END;

COMMENT ON FUNCTION public.unaccent_inmutable(text) IS
    'Quita tildes con el diccionario public.unaccent. Inmutable para el índice GIN de nombres.';

-- Zona horaria de la base: la trazabilidad depende de la hora local.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'America/Guatemala');
END
$$;

-- Rol de la aplicación. Los roles son del clúster: si ya existe (otra base del
-- mismo servidor) solo se reafirman sus atributos.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sjlc_app') THEN
        CREATE ROLE sjlc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ELSE
        ALTER ROLE sjlc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
END
$$;

-- Nadie crea objetos en el esquema público salvo su dueño.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
