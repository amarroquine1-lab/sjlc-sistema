-- 006: registros clínicos.
-- signos_vitales, consultas y recetas se versionan: nada se borra; para corregir se
-- marca la fila anterior vigente = false y se inserta una nueva con corrige_a.
-- Orden en la transacción: primero desactivar la anterior, luego insertar la nueva
-- (el índice único de vigentes no admite dos a la vez).

CREATE TABLE signos_vitales (
    id_signo_vital         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_atencion            integer NOT NULL REFERENCES atenciones (id_atencion),
    -- Rangos propuestos; pendientes de confirmar con el doctor.
    peso_kg                numeric(5,2) NULL CHECK (peso_kg BETWEEN 0.3 AND 300),
    talla_cm               numeric(5,1) NULL CHECK (talla_cm BETWEEN 30 AND 250),
    temperatura_c          numeric(3,1) NULL CHECK (temperatura_c BETWEEN 30 AND 45),
    presion_sistolica      smallint NULL CHECK (presion_sistolica BETWEEN 50 AND 260),
    presion_diastolica     smallint NULL CHECK (presion_diastolica BETWEEN 20 AND 160),
    frecuencia_cardiaca    smallint NULL CHECK (frecuencia_cardiaca BETWEEN 20 AND 250),
    saturacion_oxigeno     smallint NULL CHECK (saturacion_oxigeno BETWEEN 50 AND 100),
    hay_signos_peligro     boolean NOT NULL DEFAULT false,
    detalle_signos_peligro text NULL,
    -- Quién registró.
    id_usuario             integer NOT NULL REFERENCES usuarios (id_usuario),
    vigente                boolean NOT NULL DEFAULT true,
    corrige_a              integer NULL UNIQUE REFERENCES signos_vitales (id_signo_vital),
    fecha_creacion         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_signos_presion_completa
        CHECK ((presion_sistolica IS NULL) = (presion_diastolica IS NULL)),
    CONSTRAINT ck_signos_diastolica_menor
        CHECK (presion_diastolica < presion_sistolica),
    CONSTRAINT ck_signos_corrige_a_otro
        CHECK (corrige_a <> id_signo_vital)
);

CREATE UNIQUE INDEX ux_signos_vitales_vigente ON signos_vitales (id_atencion) WHERE vigente;
CREATE INDEX ix_signos_vitales_id_atencion ON signos_vitales (id_atencion);

CREATE TABLE consultas (
    id_consulta              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_atencion              integer NOT NULL REFERENCES atenciones (id_atencion),
    -- Doctor que atendió.
    id_usuario               integer NOT NULL REFERENCES usuarios (id_usuario),
    -- Provisional: valores pendientes de confirmar con la coordinadora.
    -- Cambiarlos es una migración nueva de una línea.
    tipo_consulta            text NOT NULL CHECK (tipo_consulta IN ('primera', 'reconsulta', 'control')),
    motivo_consulta          text NOT NULL,
    historia_enfermedad      text NULL,
    semana_gestacion         smallint NULL CHECK (semana_gestacion BETWEEN 1 AND 42),
    conducta_tratamiento     text NULL,
    problemas_identificados  text NULL,
    referido_a               text NULL,
    vigente                  boolean NOT NULL DEFAULT true,
    corrige_a                integer NULL UNIQUE REFERENCES consultas (id_consulta),
    fecha_creacion           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_consultas_corrige_a_otra CHECK (corrige_a <> id_consulta)
);

CREATE UNIQUE INDEX ux_consultas_vigente ON consultas (id_atencion) WHERE vigente;
CREATE INDEX ix_consultas_id_atencion ON consultas (id_atencion);
CREATE INDEX ix_consultas_id_usuario ON consultas (id_usuario);

-- Al corregir una consulta, sus diagnósticos se registran de nuevo en la consulta nueva.
CREATE TABLE diagnosticos_consulta (
    id_diagnostico_consulta  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_consulta              integer NOT NULL REFERENCES consultas (id_consulta),
    descripcion_diagnostico  text NOT NULL,
    -- Opcional.
    codigo_cie10             text NULL CHECK (codigo_cie10 ~ '^[A-Z][0-9]{2}(\.[0-9]{1,2})?$'),
    fecha_creacion           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_diagnosticos_consulta_id_consulta ON diagnosticos_consulta (id_consulta);
CREATE INDEX ix_diagnosticos_consulta_codigo_cie10 ON diagnosticos_consulta (codigo_cie10)
    WHERE codigo_cie10 IS NOT NULL;

-- Ligada a la atención para que doctor y nutrición puedan recetar.
CREATE TABLE recetas (
    id_receta       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_atencion     integer NOT NULL REFERENCES atenciones (id_atencion),
    -- Área que receta.
    id_area         smallint NOT NULL REFERENCES areas (id_area),
    id_usuario      integer NOT NULL REFERENCES usuarios (id_usuario),
    vigente         boolean NOT NULL DEFAULT true,
    corrige_a       integer NULL UNIQUE REFERENCES recetas (id_receta),
    fecha_creacion  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_recetas_corrige_a_otra CHECK (corrige_a <> id_receta)
);

CREATE INDEX ix_recetas_id_atencion ON recetas (id_atencion);

CREATE TABLE recetas_detalle (
    id_receta_detalle  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_receta          integer NOT NULL REFERENCES recetas (id_receta),
    id_medicamento     integer NOT NULL REFERENCES medicamentos (id_medicamento),
    cantidad_recetada  smallint NOT NULL CHECK (cantidad_recetada > 0),
    -- Dosis y frecuencia.
    indicaciones       text NOT NULL,
    fecha_creacion     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_recetas_detalle_id_receta ON recetas_detalle (id_receta);
CREATE INDEX ix_recetas_detalle_id_medicamento ON recetas_detalle (id_medicamento);
