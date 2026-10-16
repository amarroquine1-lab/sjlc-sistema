-- 005: atenciones (cada llegada), su recorrido por áreas y los próximos controles.

-- Número de atención: nunca se reinicia.
CREATE SEQUENCE seq_numero_atencion AS bigint START WITH 1 NO CYCLE;

CREATE TABLE atenciones (
    id_atencion         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_atencion     text NOT NULL UNIQUE
                        DEFAULT public.formatear_correlativo('A-', nextval('seq_numero_atencion'))
                        CHECK (numero_atencion ~ '^A-[0-9]{6,}$'),
    id_paciente         integer NOT NULL REFERENCES pacientes (id_paciente),
    id_tipo_atencion    smallint NOT NULL REFERENCES tipos_atencion (id_tipo_atencion),
    fecha_hora_llegada  timestamptz NOT NULL DEFAULT now(),
    estado              text NOT NULL DEFAULT 'en_espera'
                        CHECK (estado IN ('en_espera', 'en_atencion', 'enviado',
                                          'finalizada', 'se_retiro', 'no_concluida')),
    fecha_hora_cierre   timestamptz NULL,
    -- Quién abrió la atención.
    id_usuario          integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_creacion      timestamptz NOT NULL DEFAULT now(),
    -- Estado final si y solo si tiene hora de cierre.
    CONSTRAINT ck_atenciones_cierre
        CHECK ((estado IN ('finalizada', 'se_retiro', 'no_concluida')) = (fecha_hora_cierre IS NOT NULL)),
    CONSTRAINT ck_atenciones_cierre_despues_llegada
        CHECK (fecha_hora_cierre >= fecha_hora_llegada)
);

ALTER SEQUENCE seq_numero_atencion OWNED BY atenciones.numero_atencion;

-- Un paciente no puede tener dos atenciones abiertas.
CREATE UNIQUE INDEX ux_atenciones_abierta_por_paciente ON atenciones (id_paciente)
    WHERE estado IN ('en_espera', 'en_atencion', 'enviado');
CREATE INDEX ix_atenciones_id_paciente ON atenciones (id_paciente);
CREATE INDEX ix_atenciones_fecha_hora_llegada ON atenciones (fecha_hora_llegada);
CREATE INDEX ix_atenciones_id_tipo_atencion ON atenciones (id_tipo_atencion);
CREATE INDEX ix_atenciones_abiertas ON atenciones (estado)
    WHERE estado IN ('en_espera', 'en_atencion', 'enviado');

-- Un tramo por cada área que visita la atención. De aquí salen los tiempos de espera.
CREATE TABLE recorridos_atencion (
    id_recorrido_atencion  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_atencion            integer NOT NULL REFERENCES atenciones (id_atencion),
    id_area                smallint NOT NULL REFERENCES areas (id_area),
    -- Llega a la cola del área.
    fecha_hora_entrada     timestamptz NOT NULL DEFAULT now(),
    -- "Llamar siguiente"; espera = inicio - entrada.
    fecha_hora_inicio      timestamptz NULL,
    -- Puede tener salida sin inicio (se retiró o cierre del día).
    fecha_hora_salida      timestamptz NULL,
    -- Quién atiende; nulo mientras espera.
    id_usuario             integer NULL REFERENCES usuarios (id_usuario),
    fecha_creacion         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_recorridos_inicio CHECK (fecha_hora_inicio >= fecha_hora_entrada),
    CONSTRAINT ck_recorridos_salida CHECK (fecha_hora_salida >= coalesce(fecha_hora_inicio, fecha_hora_entrada)),
    CONSTRAINT ck_recorridos_usuario_al_iniciar CHECK (fecha_hora_inicio IS NULL OR id_usuario IS NOT NULL)
);

-- Una atención está en una sola área a la vez.
CREATE UNIQUE INDEX ux_recorridos_tramo_abierto ON recorridos_atencion (id_atencion)
    WHERE fecha_hora_salida IS NULL;
-- Un usuario atiende a un solo paciente a la vez (dos doctores nunca toman al mismo).
CREATE UNIQUE INDEX ux_recorridos_usuario_en_atencion ON recorridos_atencion (id_usuario)
    WHERE fecha_hora_inicio IS NOT NULL AND fecha_hora_salida IS NULL;
-- Colas por área.
CREATE INDEX ix_recorridos_cola_area ON recorridos_atencion (id_area, fecha_hora_entrada)
    WHERE fecha_hora_salida IS NULL;
CREATE INDEX ix_recorridos_id_atencion ON recorridos_atencion (id_atencion);
CREATE INDEX ix_recorridos_id_usuario ON recorridos_atencion (id_usuario);

CREATE TABLE proximos_controles (
    id_proximo_control  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_paciente         integer NOT NULL REFERENCES pacientes (id_paciente),
    -- Atención donde se dejó el pendiente.
    id_atencion         integer NOT NULL REFERENCES atenciones (id_atencion),
    -- Área a la que va.
    id_area             smallint NOT NULL REFERENCES areas (id_area),
    -- "Pentavalente 2.ª dosis", "control en 1 mes".
    descripcion         text NOT NULL,
    fecha_sugerida      date NULL,
    estado              text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'cumplido', 'cancelado')),
    id_usuario          integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_creacion      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_proximos_controles_id_paciente ON proximos_controles (id_paciente);
CREATE INDEX ix_proximos_controles_id_atencion ON proximos_controles (id_atencion);
