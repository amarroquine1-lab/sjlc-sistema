-- 004: pacientes, encargados, vínculo paciente-encargado y uniones de duplicados.

-- Arma un correlativo con al menos 6 dígitos sin cortar números más largos
-- (lpad recortaría 1000000 a 100000).
CREATE FUNCTION public.formatear_correlativo(prefijo text, numero bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
    SELECT prefijo || repeat('0', greatest(6 - length(numero::text), 0)) || numero::text;
END;

-- Código de paciente: nunca se reinicia.
CREATE SEQUENCE seq_codigo_paciente AS bigint START WITH 1 NO CYCLE;

CREATE TABLE pacientes (
    id_paciente               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_paciente           text NOT NULL UNIQUE
                              DEFAULT public.formatear_correlativo('SJLC-', nextval('seq_codigo_paciente'))
                              CHECK (codigo_paciente ~ '^SJLC-[0-9]{6,}$'),
    -- Nombres, apellidos y fecha de nacimiento solo pueden faltar en emergencias.
    nombres                   text NULL,
    apellidos                 text NULL,
    fecha_nacimiento          date NULL CHECK (fecha_nacimiento <= current_date),
    -- Solo emergencia, cuando no se conoce la fecha de nacimiento.
    edad_aproximada_anios     smallint NULL CHECK (edad_aproximada_anios BETWEEN 0 AND 120),
    sexo                      char(1) NOT NULL CHECK (sexo IN ('F', 'M')),
    -- Opcional en menores.
    cui                       char(13) NULL CHECK (cui ~ '^[0-9]{13}$'),
    telefono                  text NULL,
    -- Calle y comunidad o colonia.
    direccion                 text NULL,
    id_municipio_residencia   smallint NULL REFERENCES municipios (id_municipio),
    id_municipio_nacimiento   smallint NULL REFERENCES municipios (id_municipio),
    id_pueblo                 smallint NULL REFERENCES pueblos (id_pueblo),
    -- 23 = No indica.
    id_comunidad_linguistica  smallint NOT NULL DEFAULT 23
                              REFERENCES comunidades_linguisticas (id_comunidad_linguistica),
    -- Número de expediente del libro de papel.
    numero_registro_libro     text NULL,
    -- Lista pendiente de recepción (emergencias).
    datos_incompletos         boolean NOT NULL DEFAULT false,
    -- Si fue unido a otro registro; el unido queda inactivo.
    id_paciente_principal     integer NULL REFERENCES pacientes (id_paciente),
    -- Quién lo registró.
    id_usuario                integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_creacion            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_pacientes_datos_completos
        CHECK (datos_incompletos OR (nombres IS NOT NULL AND apellidos IS NOT NULL AND fecha_nacimiento IS NOT NULL)),
    CONSTRAINT ck_pacientes_edad
        CHECK (fecha_nacimiento IS NOT NULL OR edad_aproximada_anios IS NOT NULL),
    CONSTRAINT ck_pacientes_principal_distinto
        CHECK (id_paciente_principal <> id_paciente)
);

ALTER SEQUENCE seq_codigo_paciente OWNED BY pacientes.codigo_paciente;

CREATE UNIQUE INDEX ux_pacientes_cui ON pacientes (cui) WHERE cui IS NOT NULL;
-- Búsqueda por nombre parcial sin tildes ni mayúsculas. Las consultas deben usar
-- exactamente esta expresión para aprovechar el índice.
CREATE INDEX ix_pacientes_nombre_trgm ON pacientes
    USING gin (public.unaccent_inmutable(lower(coalesce(nombres, '') || ' ' || coalesce(apellidos, ''))) gin_trgm_ops);
CREATE INDEX ix_pacientes_fecha_nacimiento ON pacientes (fecha_nacimiento);
CREATE INDEX ix_pacientes_numero_registro_libro ON pacientes (numero_registro_libro)
    WHERE numero_registro_libro IS NOT NULL;
CREATE INDEX ix_pacientes_datos_incompletos ON pacientes (id_paciente) WHERE datos_incompletos;
CREATE INDEX ix_pacientes_id_paciente_principal ON pacientes (id_paciente_principal)
    WHERE id_paciente_principal IS NOT NULL;

CREATE TABLE encargados (
    id_encargado    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombres         text NOT NULL,
    apellidos       text NOT NULL,
    -- Para buscar al menor por el DPI de su encargado.
    dpi             char(13) NULL CHECK (dpi ~ '^[0-9]{13}$'),
    telefono        text NULL,
    fecha_creacion  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_encargados_dpi ON encargados (dpi) WHERE dpi IS NOT NULL;

-- Única tabla en la que se permite DELETE (un vínculo equivocado se corrige; queda en bitácora).
CREATE TABLE pacientes_encargados (
    id_paciente     integer NOT NULL REFERENCES pacientes (id_paciente),
    id_encargado    integer NOT NULL REFERENCES encargados (id_encargado),
    -- Madre, padre, tutor...
    parentesco      text NOT NULL,
    es_principal    boolean NOT NULL DEFAULT false,
    fecha_creacion  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id_paciente, id_encargado)
);

CREATE UNIQUE INDEX ux_pacientes_encargados_principal ON pacientes_encargados (id_paciente) WHERE es_principal;
CREATE INDEX ix_pacientes_encargados_id_encargado ON pacientes_encargados (id_encargado);

CREATE TABLE uniones_pacientes (
    id_union_paciente  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Registro que se conserva.
    id_paciente        integer NOT NULL REFERENCES pacientes (id_paciente),
    -- Registro absorbido; sus atenciones pasan al conservado. Solo se absorbe una vez.
    id_paciente_unido  integer NOT NULL UNIQUE REFERENCES pacientes (id_paciente),
    motivo             text NOT NULL CHECK (length(btrim(motivo)) > 0),
    -- Copia completa del registro absorbido.
    datos_unido        jsonb NOT NULL,
    id_usuario         integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_hora         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_uniones_pacientes_distintos CHECK (id_paciente_unido <> id_paciente)
);

CREATE INDEX ix_uniones_pacientes_id_paciente ON uniones_pacientes (id_paciente);
