-- 003: usuarios del sistema y bitácora de auditoría.

CREATE TABLE usuarios (
    id_usuario               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Inicial + apellido, minúsculas sin tildes ni ñ.
    nombre_usuario           text NOT NULL UNIQUE CHECK (nombre_usuario ~ '^[a-z]+$'),
    nombres                  text NOT NULL,
    apellidos                text NOT NULL,
    -- Un solo rol por usuario.
    id_rol                   smallint NOT NULL REFERENCES roles (id_rol),
    -- argon2id; nunca texto plano.
    contrasena_hash          text NOT NULL,
    debe_cambiar_contrasena  boolean NOT NULL DEFAULT true,
    intentos_fallidos        smallint NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
    -- 5 fallos: bloqueo de 15 minutos.
    bloqueado_hasta          timestamptz NULL,
    -- Se desactiva, no se borra.
    activo                   boolean NOT NULL DEFAULT true,
    ultimo_ingreso           timestamptz NULL,
    fecha_creacion           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_usuarios_id_rol ON usuarios (id_rol);

-- Solo INSERT: UPDATE, DELETE y TRUNCATE se bloquean en 007.
CREATE TABLE bitacora (
    id_bitacora               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha_hora                timestamptz NOT NULL DEFAULT now(),
    -- Nulo en intentos con usuario inexistente y en cambios hechos por migraciones o seeds.
    id_usuario                integer NULL REFERENCES usuarios (id_usuario),
    nombre_usuario_intentado  text NULL,
    -- crear, editar, eliminar, inicio_sesion, inicio_sesion_fallido, unir,
    -- restablecer_contrasena, ver_historial...
    accion                    text NOT NULL,
    -- Tabla afectada.
    entidad                   text NOT NULL,
    id_registro               bigint NULL,
    -- Desde CF-Connecting-IP.
    direccion_ip              inet NULL,
    valor_anterior            jsonb NULL,
    valor_nuevo               jsonb NULL,
    -- Motivo (p. ej. de una unión).
    detalle                   text NULL
);

CREATE INDEX ix_bitacora_fecha_hora ON bitacora (fecha_hora);
CREATE INDEX ix_bitacora_id_usuario ON bitacora (id_usuario);
CREATE INDEX ix_bitacora_entidad_registro ON bitacora (entidad, id_registro);
