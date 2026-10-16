-- Datos FICTICIOS para desarrollo y pruebas. Nunca en producción.
-- Nombres genéricos inventados, CUI/DPI inventados que empiezan con 9900,
-- teléfonos 5555-xxxx y direcciones "de prueba".
-- Requiere, en este orden: migraciones, seed-produccion.sql, seed-municipios.sql y
-- los usuarios de prueba creados por el sembrador (padmin, precepcion, psignos,
-- pdoctor, pdoctora, pnutricion, pvacunacion, pfarmacia).
-- Si ya hay pacientes en la base, no carga pacientes ni atenciones (no duplica).

DO $$
BEGIN
    IF coalesce(current_setting('sjlc.entorno', true), '') IN ('', 'produccion') THEN
        RAISE EXCEPTION 'El seed de pruebas no se aplica: sjlc.entorno no está fijado o es "produccion".';
    END IF;
END
$$;

DO $$
DECLARE
    v_faltan text;
BEGIN
    SELECT string_agg(n, ', ') INTO v_faltan
    FROM unnest(ARRAY['padmin', 'precepcion', 'psignos', 'pdoctor', 'pdoctora',
                      'pnutricion', 'pvacunacion', 'pfarmacia']) AS n
    WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.nombre_usuario = n);
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'Faltan los usuarios de prueba: %. Ejecute el sembrador de pruebas.', v_faltan;
    END IF;

    -- Este archivo usa los ids fijos del seed de producción.
    IF (SELECT string_agg(nombre_area, '|' ORDER BY id_area) FROM areas)
       IS DISTINCT FROM 'recepción|signos vitales|doctor|nutrición|vacunación|farmacia' THEN
        RAISE EXCEPTION 'Las áreas no coinciden con el seed de producción.';
    END IF;
    IF (SELECT string_agg(nombre_tipo_atencion, '|' ORDER BY id_tipo_atencion) FROM tipos_atencion)
       IS DISTINCT FROM 'consulta general|vacunación|nutrición directa|planificación familiar|emergencia' THEN
        RAISE EXCEPTION 'Los tipos de atención no coinciden con el seed de producción.';
    END IF;

    IF (SELECT count(*) FROM municipios m JOIN departamentos d USING (id_departamento)
        WHERE d.nombre_departamento = 'Guatemala'
          AND m.nombre_municipio IN ('Mixco', 'Villa Nueva', 'Chinautla')) <> 3 THEN
        RAISE EXCEPTION 'Faltan los municipios Mixco, Villa Nueva o Chinautla del departamento Guatemala. Ejecute seed-municipios.sql.';
    END IF;

    IF EXISTS (SELECT 1 FROM pacientes) THEN
        RAISE NOTICE 'Ya hay pacientes en la base: se omiten pacientes, atenciones y registros clínicos de prueba.';
    END IF;
END
$$;

-- Catálogos de prueba --------------------------------------------------------------

-- Los pueblos y las comunidades lingüísticas oficiales (INE) los carga seed-produccion.sql.

-- Medicamentos de prueba; el catálogo real lo entrega farmacia.
INSERT INTO medicamentos (nombre_medicamento, id_presentacion, concentracion)
SELECT v.nombre, p.id_presentacion, v.concentracion
FROM (VALUES
    ('Acetaminofén', 'tableta', '500 mg'),
    ('Acetaminofén', 'frasco', '120 mg/5 ml'),
    ('Amoxicilina', 'cápsula', '500 mg'),
    ('Amoxicilina', 'frasco', '250 mg/5 ml'),
    ('Ibuprofeno', 'tableta', '400 mg'),
    ('Loratadina', 'tableta', '10 mg'),
    ('Losartán', 'tableta', '50 mg'),
    ('Metformina', 'tableta', '850 mg'),
    ('Omeprazol', 'cápsula', '20 mg'),
    ('Sulfato ferroso', 'gotas', '125 mg/ml'),
    ('Albendazol', 'tableta', '400 mg'),
    ('Trimetoprim sulfametoxazol', 'frasco', '200/40 mg/5 ml')
) AS v (nombre, presentacion, concentracion)
JOIN presentaciones p ON p.nombre_presentacion = v.presentacion
ON CONFLICT DO NOTHING;

-- Tablas de apoyo (solo para esta carga) ---------------------------------------------

CREATE TEMP TABLE tmp_municipios AS
SELECT m.nombre_municipio, m.id_municipio
FROM municipios m
JOIN departamentos d USING (id_departamento)
WHERE d.nombre_departamento = 'Guatemala'
  AND m.nombre_municipio IN ('Mixco', 'Villa Nueva', 'Chinautla');

CREATE TEMP TABLE tmp_pacientes (clave text PRIMARY KEY, id_paciente integer NOT NULL UNIQUE);
CREATE TEMP TABLE tmp_encargados (clave text PRIMARY KEY, id_encargado integer NOT NULL UNIQUE);
CREATE TEMP TABLE tmp_atenciones (clave text PRIMARY KEY, id_atencion integer NOT NULL UNIQUE,
                                  fecha_hora_llegada timestamptz NOT NULL);
CREATE TEMP TABLE tmp_consultas (clave_atencion text PRIMARY KEY, id_consulta integer NOT NULL);
CREATE TEMP TABLE tmp_recetas (clave_atencion text PRIMARY KEY, id_receta integer NOT NULL);

-- Pacientes (30) -------------------------------------------------------------------
-- p10, p11, p12, p19, p26, p28: menores sin CUI, con encargado.
-- p13 y p24: emergencias con datos incompletos.
-- p20/p21: duplicado que se une más abajo. p22/p23: posible duplicado sin unir.
-- p30: registrado sin atenciones.

WITH datos (clave, nombres, apellidos, fecha_nacimiento, edad_aproximada_anios, sexo, cui,
            telefono, direccion, municipio_residencia, municipio_nacimiento, id_pueblo,
            id_comunidad_linguistica, numero_registro_libro, datos_incompletos, fecha_creacion) AS (
    VALUES
    ('p01', 'Ana Lucía', 'Ramírez Soto', date '1985-03-14', NULL::smallint, 'F', '9900000010101', '5555-0101', 'Dirección de prueba 1, Colonia Ficticia', 'Mixco', NULL, 5, 99, '09-0101-26', false, (current_date - 90 + time '07:30')::timestamptz),
    ('p02', 'Carlos Enrique', 'Morales Díaz', date '1972-11-02', NULL, 'M', '9900000020101', '5555-0102', 'Dirección de prueba 2, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p03', 'Rosa Elena', 'Castillo Pérez', date '1960-07-21', NULL, 'F', '9900000030101', '5555-0103', 'Dirección de prueba 3, Colonia Ejemplo', 'Villa Nueva', NULL, 5, 99, '09-0233-26', false, current_date - 90 + time '07:30'),
    ('p04', 'Lucía Fernanda', 'Hernández Ruiz', date '1998-01-30', NULL, 'F', '9900000040101', '5555-0104', 'Dirección de prueba 4, Colonia Ficticia', 'Mixco', NULL, 1, 11, NULL, false, current_date - 90 + time '07:30'),
    ('p05', 'Mario Alberto', 'Gómez Juárez', date '1955-09-09', NULL, 'M', '9900000050101', '5555-0105', 'Dirección de prueba 5, Aldea Ejemplo', 'Chinautla', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p06', 'Silvia Patricia', 'Ortiz Méndez', date '1979-06-17', NULL, 'F', '9900000060101', NULL, 'Dirección de prueba 6, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p07', 'José Luis', 'Martínez Cruz', date '1990-02-25', NULL, 'M', '9900000070101', '5555-0107', 'Dirección de prueba 7, Colonia Ficticia', 'Mixco', NULL, 1, 10, NULL, false, current_date - 90 + time '07:30'),
    ('p08', 'Sofía Isabel', 'Reyes Aguilar', date '2001-12-05', NULL, 'F', '9900000080101', '5555-0108', 'Dirección de prueba 8, Colonia Ejemplo', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p09', 'Andrea Beatriz', 'Flores Chávez', date '1995-04-11', NULL, 'F', '9900000090101', '5555-0109', 'Dirección de prueba 9, Colonia Ejemplo', 'Villa Nueva', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p10', 'Mateo', 'Ortiz Ramírez', (current_date - interval '1 year 7 months')::date, NULL, 'M', NULL, NULL, 'Dirección de prueba 1, Colonia Ficticia', 'Mixco', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p11', 'Valeria', 'Gómez López', (current_date - interval '3 years 2 months')::date, NULL, 'F', NULL, NULL, 'Dirección de prueba 11, Colonia Ficticia', 'Mixco', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p12', 'Diego Alejandro', 'Gómez López', (current_date - interval '6 years 5 months')::date, NULL, 'M', NULL, NULL, 'Dirección de prueba 11, Colonia Ficticia', 'Mixco', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p13', NULL, NULL, NULL, 45, 'M', NULL, NULL, NULL, NULL, NULL, NULL, 99, NULL, true, current_date - 1 + time '14:00'),
    ('p14', 'Juana María', 'Tum Pérez', date '1983-05-19', NULL, 'F', '9900000140101', '5555-0114', 'Dirección de prueba 14, Colonia Ejemplo', 'Mixco', NULL, 1, 11, NULL, false, current_date - 90 + time '07:30'),
    ('p15', 'Pedro Antonio', 'Sánchez Velásquez', date '1968-10-10', NULL, 'M', '9900000150101', '5555-0115', 'Dirección de prueba 15, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p16', 'Marta Alicia', 'Rodríguez Paz', date '1988-08-08', NULL, 'F', '9900000160101', '5555-0116', 'Dirección de prueba 16, Colonia Ficticia', 'Villa Nueva', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p17', 'Luis Fernando', 'García Mejía', date '1982-03-03', NULL, 'M', '9900000170101', '5555-0117', 'Dirección de prueba 17, Colonia Ejemplo', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p18', 'Carmen Rosa', 'Vásquez Estrada', date '1975-12-12', NULL, 'F', '9900000180101', '5555-0118', 'Dirección de prueba 18, Colonia Ejemplo', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p19', 'Camila', 'Morales Pérez', (current_date - interval '1 year 1 month')::date, NULL, 'F', NULL, NULL, 'Dirección de prueba 19, Colonia Ficticia', 'Mixco', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p20', 'María José', 'López García', date '1992-06-15', NULL, 'F', '9900000200101', '5555-0120', 'Dirección de prueba 20, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p21', 'Maria Jose', 'Lopez Garcia', date '1992-06-15', NULL, 'F', NULL, '5555-0120', 'Dirección de prueba 20, Col. Ficticia', 'Mixco', NULL, NULL, 99, NULL, false, current_date - 8 + time '09:10'),
    ('p22', 'Juan Carlos', 'Pérez Ramos', date '1987-09-23', NULL, 'M', '9900000220101', '5555-0122', 'Dirección de prueba 22, Colonia Ejemplo', 'Chinautla', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p23', 'Juan Karlos', 'Peres Ramos', date '1987-09-23', NULL, 'M', NULL, '5555-0123', 'Dirección de prueba 22, Colonia Ejemplo', 'Chinautla', NULL, NULL, 99, NULL, false, current_date - 2 + time '11:15'),
    ('p24', 'Rosa', NULL, NULL, 30, 'F', NULL, NULL, NULL, NULL, NULL, NULL, 99, NULL, true, now() - interval '10 minutes'),
    ('p25', 'Ricardo José', 'Herrera Monzón', date '1965-01-20', NULL, 'M', '9900000250101', '5555-0125', 'Dirección de prueba 25, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p26', 'Emanuel', 'Castillo Ruiz', (current_date - interval '2 years 9 months')::date, NULL, 'M', NULL, NULL, 'Dirección de prueba 26, Colonia Ejemplo', 'Villa Nueva', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p27', 'Elena Margarita', 'Cifuentes Arana', date '1993-07-07', NULL, 'F', '9900000270101', '5555-0127', 'Dirección de prueba 27, Colonia Ficticia', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p28', 'Fernando', 'Barrios Cabrera', (current_date - interval '12 years 3 months')::date, NULL, 'M', NULL, NULL, 'Dirección de prueba 28, Colonia Ficticia', 'Mixco', 'Mixco', 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p29', 'Gabriela', 'Torres Lima', date '2000-02-02', NULL, 'F', '9900000290101', '5555-0129', 'Dirección de prueba 29, Colonia Ejemplo', 'Mixco', NULL, 5, 99, NULL, false, current_date - 90 + time '07:30'),
    ('p30', 'Héctor Hugo', 'Álvarez Pineda', date '1950-05-05', NULL, 'M', '9900000300101', '5555-0130', 'Dirección de prueba 30, Colonia Ficticia', 'Mixco', NULL, 6, 99, NULL, false, current_date - 90 + time '07:30')
),
ins AS (
    INSERT INTO pacientes (nombres, apellidos, fecha_nacimiento, edad_aproximada_anios, sexo, cui,
                           telefono, direccion, id_municipio_residencia, id_municipio_nacimiento,
                           id_pueblo, id_comunidad_linguistica, numero_registro_libro,
                           datos_incompletos, id_usuario, fecha_creacion)
    SELECT d.nombres, d.apellidos, d.fecha_nacimiento, d.edad_aproximada_anios, d.sexo, d.cui,
           d.telefono, d.direccion, mr.id_municipio, mn.id_municipio,
           d.id_pueblo, d.id_comunidad_linguistica, d.numero_registro_libro,
           d.datos_incompletos, u.id_usuario, d.fecha_creacion
    FROM datos d
    JOIN usuarios u ON u.nombre_usuario = 'precepcion'
    LEFT JOIN tmp_municipios mr ON mr.nombre_municipio = d.municipio_residencia
    LEFT JOIN tmp_municipios mn ON mn.nombre_municipio = d.municipio_nacimiento
    WHERE NOT EXISTS (SELECT 1 FROM pacientes)
    ORDER BY d.clave
    RETURNING id_paciente, nombres, apellidos, fecha_nacimiento, edad_aproximada_anios, sexo
)
INSERT INTO tmp_pacientes (clave, id_paciente)
SELECT d.clave, i.id_paciente
FROM datos d
JOIN ins i ON i.nombres IS NOT DISTINCT FROM d.nombres
          AND i.apellidos IS NOT DISTINCT FROM d.apellidos
          AND i.fecha_nacimiento IS NOT DISTINCT FROM d.fecha_nacimiento
          AND i.edad_aproximada_anios IS NOT DISTINCT FROM d.edad_aproximada_anios
          AND i.sexo = d.sexo;

-- Encargados y vínculos ------------------------------------------------------------

WITH datos (clave, nombres, apellidos, dpi, telefono) AS (
    VALUES
    ('e1', 'Ana Lucía', 'Ramírez Soto', '9900000010101', '5555-0101'),
    ('e2', 'Brenda Lisseth', 'López Juárez', '9900001020101', '5555-0202'),
    ('e3', 'Óscar Daniel', 'Gómez Sánchez', '9900001030101', '5555-0203'),
    ('e4', 'Claudia Marisol', 'Pérez Morales', '9900001040101', '5555-0204'),
    ('e5', 'Irma Yolanda', 'Ruiz Gómez', '9900001050101', NULL),
    ('e6', 'Julio César', 'Barrios Méndez', '9900001060101', '5555-0206')
),
ins AS (
    INSERT INTO encargados (nombres, apellidos, dpi, telefono, fecha_creacion)
    SELECT d.nombres, d.apellidos, d.dpi, d.telefono, current_date - 90 + time '07:30'
    FROM datos d
    WHERE EXISTS (SELECT 1 FROM tmp_pacientes)
    ORDER BY d.clave
    RETURNING id_encargado, dpi
)
INSERT INTO tmp_encargados (clave, id_encargado)
SELECT d.clave, i.id_encargado
FROM datos d
JOIN ins i ON i.dpi = d.dpi;

INSERT INTO pacientes_encargados (id_paciente, id_encargado, parentesco, es_principal, fecha_creacion)
SELECT tp.id_paciente, te.id_encargado, d.parentesco, d.es_principal, current_date - 90 + time '07:30'
FROM (VALUES
    ('p10', 'e1', 'Madre', true),
    ('p11', 'e2', 'Madre', true),
    ('p11', 'e3', 'Padre', false),
    ('p12', 'e2', 'Madre', true),
    ('p12', 'e3', 'Padre', false),
    ('p19', 'e4', 'Madre', true),
    ('p26', 'e5', 'Abuela', true),
    ('p28', 'e6', 'Padre', true)
) AS d (paciente, encargado, parentesco, es_principal)
JOIN tmp_pacientes tp ON tp.clave = d.paciente
JOIN tmp_encargados te ON te.clave = d.encargado;

-- Atenciones (30) ------------------------------------------------------------------
-- Pasadas: finalizada, no_concluida (cierre del día) y se_retiro.
-- De hoy: en_espera, en_atencion, enviado, se_retiro y finalizada.
-- Tipos: 1 consulta general, 2 vacunación, 3 nutrición directa,
--        4 planificación familiar, 5 emergencia.

WITH datos (clave, paciente, id_tipo_atencion, fecha_hora_llegada, estado, minutos_cierre) AS (
    VALUES
    ('a01', 'p01', 1, (current_date - 20 + time '08:00')::timestamptz, 'finalizada', 55),
    ('a02', 'p02', 1, current_date - 15 + time '08:30', 'finalizada', 50),
    ('a03', 'p03', 1, current_date - 10 + time '09:00', 'finalizada', 70),
    ('a04', 'p10', 2, current_date - 30 + time '08:15', 'finalizada', 35),
    ('a05', 'p11', 3, current_date - 14 + time '08:40', 'finalizada', 65),
    ('a06', 'p12', 1, current_date - 7 + time '10:00', 'finalizada', 75),
    ('a07', 'p04', 4, current_date - 5 + time '09:20', 'finalizada', 45),
    ('a08', 'p01', 1, current_date - 2 + time '08:10', 'finalizada', 60),
    ('a09', 'p05', 1, current_date - 1 + time '15:30', 'no_concluida', 150),
    ('a10', 'p06', 1, current_date - 1 + time '09:00', 'se_retiro', 40),
    ('a11', 'p13', 5, current_date - 1 + time '14:00', 'finalizada', 45),
    ('a12', 'p07', 1, current_date - 3 + time '08:45', 'finalizada', 55),
    ('a13', 'p09', 2, current_date - 6 + time '11:00', 'finalizada', 30),
    ('a14', 'p20', 1, current_date - 12 + time '08:20', 'finalizada', 50),
    ('a15', 'p21', 1, current_date - 8 + time '09:10', 'finalizada', 50),
    ('a16', 'p22', 1, current_date - 9 + time '10:30', 'finalizada', 45),
    ('a17', 'p23', 1, current_date - 2 + time '11:15', 'finalizada', 40),
    ('a18', 'p29', 4, current_date - 80 + time '09:00', 'finalizada', 40),
    ('a19', 'p14', 1, now() - interval '15 minutes', 'en_espera', NULL::integer),
    ('a20', 'p15', 1, now() - interval '25 minutes', 'en_espera', NULL),
    ('a21', 'p16', 1, now() - interval '30 minutes', 'en_atencion', NULL),
    ('a22', 'p17', 1, now() - interval '60 minutes', 'enviado', NULL),
    ('a23', 'p18', 1, now() - interval '75 minutes', 'en_atencion', NULL),
    ('a24', 'p19', 2, now() - interval '40 minutes', 'enviado', NULL),
    ('a25', 'p24', 5, now() - interval '10 minutes', 'en_atencion', NULL),
    ('a26', 'p25', 1, now() - interval '90 minutes', 'enviado', NULL),
    ('a27', 'p26', 3, now() - interval '50 minutes', 'enviado', NULL),
    ('a28', 'p27', 1, now() - interval '120 minutes', 'se_retiro', 100),
    ('a29', 'p28', 1, now() - interval '100 minutes', 'finalizada', 70),
    ('a30', 'p08', 1, current_date - 4 + time '10:00', 'finalizada', 40)
),
ins AS (
    INSERT INTO atenciones (id_paciente, id_tipo_atencion, fecha_hora_llegada, estado,
                            fecha_hora_cierre, id_usuario, fecha_creacion)
    SELECT tp.id_paciente, d.id_tipo_atencion, d.fecha_hora_llegada, d.estado,
           d.fecha_hora_llegada + d.minutos_cierre * interval '1 minute', u.id_usuario, d.fecha_hora_llegada
    FROM datos d
    JOIN tmp_pacientes tp ON tp.clave = d.paciente
    JOIN usuarios u ON u.nombre_usuario = 'precepcion'
    ORDER BY d.fecha_hora_llegada
    RETURNING id_atencion, id_paciente, fecha_hora_llegada
)
INSERT INTO tmp_atenciones (clave, id_atencion, fecha_hora_llegada)
SELECT d.clave, i.id_atencion, i.fecha_hora_llegada
FROM datos d
JOIN tmp_pacientes tp ON tp.clave = d.paciente
JOIN ins i ON i.id_paciente = tp.id_paciente AND i.fecha_hora_llegada = d.fecha_hora_llegada;

-- Recorridos: minutos desde la llegada (entrada, inicio, salida).
-- Áreas: 1 recepción, 2 signos, 3 doctor, 4 nutrición, 5 vacunación, 6 farmacia.
-- Inicio nulo = esperó sin ser atendido; salida nula = tramo abierto.

INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_entrada, fecha_hora_inicio,
                                 fecha_hora_salida, id_usuario, fecha_creacion)
SELECT ta.id_atencion, d.id_area,
       ta.fecha_hora_llegada + d.entrada * interval '1 minute',
       ta.fecha_hora_llegada + d.inicio * interval '1 minute',
       ta.fecha_hora_llegada + d.salida * interval '1 minute',
       u.id_usuario,
       ta.fecha_hora_llegada + d.entrada * interval '1 minute'
FROM (VALUES
    ('a01', 1, 0, 0, 4, 'precepcion'), ('a01', 2, 4, 10, 16, 'psignos'), ('a01', 3, 16, 30, 45, 'pdoctor'), ('a01', 6, 45, 50, 55, 'pfarmacia'),
    ('a02', 1, 0, 0, 3, 'precepcion'), ('a02', 2, 3, 8, 14, 'psignos'), ('a02', 3, 14, 30, 50, 'pdoctora'),
    ('a03', 1, 0, 0, 5, 'precepcion'), ('a03', 2, 5, 12, 18, 'psignos'), ('a03', 3, 18, 35, 60, 'pdoctor'), ('a03', 6, 60, 65, 70, 'pfarmacia'),
    ('a04', 1, 0, 0, 4, 'precepcion'), ('a04', 2, 4, 8, 14, 'psignos'), ('a04', 5, 14, 20, 35, 'pvacunacion'),
    ('a05', 1, 0, 0, 3, 'precepcion'), ('a05', 2, 3, 10, 15, 'psignos'), ('a05', 4, 15, 25, 55, 'pnutricion'), ('a05', 6, 55, 60, 65, 'pfarmacia'),
    ('a06', 1, 0, 0, 4, 'precepcion'), ('a06', 2, 4, 10, 16, 'psignos'), ('a06', 3, 16, 30, 50, 'pdoctora'), ('a06', 5, 50, 60, 75, 'pvacunacion'),
    ('a07', 1, 0, 0, 3, 'precepcion'), ('a07', 2, 3, 6, 12, 'psignos'), ('a07', 3, 12, 20, 45, 'pdoctor'),
    ('a08', 1, 0, 0, 3, 'precepcion'), ('a08', 2, 3, 8, 13, 'psignos'), ('a08', 3, 13, 25, 50, 'pdoctor'), ('a08', 6, 50, 55, 60, 'pfarmacia'),
    ('a09', 1, 0, 0, 4, 'precepcion'), ('a09', 2, 4, 10, 18, 'psignos'), ('a09', 3, 18, NULL, 150, NULL),
    ('a10', 1, 0, 0, 3, 'precepcion'), ('a10', 2, 3, NULL, 40, NULL),
    ('a11', 1, 0, 0, 2, 'precepcion'), ('a11', 3, 2, 3, 45, 'pdoctora'),
    ('a12', 1, 0, 0, 3, 'precepcion'), ('a12', 2, 3, 9, 15, 'psignos'), ('a12', 3, 15, 28, 55, 'pdoctor'),
    ('a13', 1, 0, 0, 3, 'precepcion'), ('a13', 2, 3, 7, 12, 'psignos'), ('a13', 5, 12, 18, 30, 'pvacunacion'),
    ('a14', 1, 0, 0, 4, 'precepcion'), ('a14', 2, 4, 10, 16, 'psignos'), ('a14', 3, 16, 28, 50, 'pdoctor'),
    ('a15', 1, 0, 0, 4, 'precepcion'), ('a15', 2, 4, 9, 15, 'psignos'), ('a15', 3, 15, 30, 50, 'pdoctora'),
    ('a16', 1, 0, 0, 3, 'precepcion'), ('a16', 2, 3, 8, 14, 'psignos'), ('a16', 3, 14, 25, 45, 'pdoctor'),
    ('a17', 1, 0, 0, 3, 'precepcion'), ('a17', 2, 3, 10, 15, 'psignos'), ('a17', 3, 15, 22, 40, 'pdoctora'),
    ('a18', 1, 0, 0, 3, 'precepcion'), ('a18', 2, 3, 6, 12, 'psignos'), ('a18', 3, 12, 20, 40, 'pdoctora'),
    ('a19', 1, 0, 0, 3, 'precepcion'), ('a19', 2, 3, NULL, NULL, NULL),
    ('a20', 1, 0, 0, 2, 'precepcion'), ('a20', 2, 2, NULL, NULL, NULL),
    ('a21', 1, 0, 0, 3, 'precepcion'), ('a21', 2, 3, 10, NULL, 'psignos'),
    ('a22', 1, 0, 0, 4, 'precepcion'), ('a22', 2, 4, 12, 20, 'psignos'), ('a22', 3, 20, NULL, NULL, NULL),
    ('a23', 1, 0, 0, 3, 'precepcion'), ('a23', 2, 3, 10, 16, 'psignos'), ('a23', 3, 16, 45, NULL, 'pdoctor'),
    ('a24', 1, 0, 0, 3, 'precepcion'), ('a24', 2, 3, 10, 15, 'psignos'), ('a24', 5, 15, NULL, NULL, NULL),
    ('a25', 1, 0, 0, 1, 'precepcion'), ('a25', 3, 1, 2, NULL, 'pdoctora'),
    ('a26', 1, 0, 0, 3, 'precepcion'), ('a26', 2, 3, 10, 16, 'psignos'), ('a26', 3, 16, 30, 60, 'pdoctor'), ('a26', 6, 60, NULL, NULL, NULL),
    ('a27', 1, 0, 0, 3, 'precepcion'), ('a27', 2, 3, 8, 13, 'psignos'), ('a27', 4, 13, NULL, NULL, NULL),
    ('a28', 1, 0, 0, 3, 'precepcion'), ('a28', 2, 3, 10, 18, 'psignos'), ('a28', 3, 18, NULL, 100, NULL),
    ('a29', 1, 0, 0, 3, 'precepcion'), ('a29', 2, 3, 8, 14, 'psignos'), ('a29', 3, 14, 25, 70, 'pdoctor'),
    ('a30', 1, 0, 0, 3, 'precepcion'), ('a30', 2, 3, 8, 13, 'psignos'), ('a30', 3, 13, 20, 40, 'pdoctora')
) AS d (atencion, id_area, entrada, inicio, salida, usuario)
JOIN tmp_atenciones ta ON ta.clave = d.atencion
LEFT JOIN usuarios u ON u.nombre_usuario = d.usuario
ORDER BY ta.fecha_hora_llegada, d.entrada;

-- Signos vitales (registrados al salir de signos) --------------------------------------

INSERT INTO signos_vitales (id_atencion, peso_kg, talla_cm, temperatura_c, presion_sistolica,
                            presion_diastolica, frecuencia_cardiaca, saturacion_oxigeno,
                            hay_signos_peligro, detalle_signos_peligro, id_usuario, fecha_creacion)
SELECT ta.id_atencion, d.peso, d.talla, d.temperatura, d.sistolica, d.diastolica, d.frecuencia,
       d.saturacion, d.peligro, d.detalle, u.id_usuario,
       ta.fecha_hora_llegada + d.minuto * interval '1 minute'
FROM (VALUES
    ('a01', 16, 68.5, 158.0, 36.6, 150::smallint, 95::smallint, 82, 97, false, NULL::text),
    ('a02', 14, 82.0, 170.0, 36.8, 120, 80, 76, 98, false, NULL),
    ('a03', 18, 74.2, 155.0, 36.5, 135, 85, 80, 96, false, NULL),
    ('a04', 14, 10.8, 80.5, 36.7, NULL, NULL, 120, 98, false, NULL),
    ('a05', 15, 12.1, 92.0, 36.6, NULL, NULL, 110, 98, false, NULL),
    ('a06', 16, 20.5, 115.0, 38.4, NULL, NULL, 115, 97, false, NULL),
    ('a07', 12, 58.0, 160.0, 36.5, 110, 70, 72, 99, false, NULL),
    ('a08', 13, 68.0, 158.0, 36.5, 135, 85, 78, 98, false, NULL),
    ('a09', 18, 77.0, 168.0, 36.9, 140, 90, 84, 95, false, NULL),
    -- a12: el peso se digitó mal (7.2); se corrige más abajo con una versión nueva.
    ('a12', 15, 7.2, 172.0, 36.7, 118, 76, 70, 98, false, NULL),
    ('a13', 12, 61.0, 163.0, 36.4, 105, 68, 74, 99, false, NULL),
    ('a14', 16, 64.0, 157.0, 37.8, 115, 75, 90, 97, false, NULL),
    ('a15', 15, 63.5, 157.0, 36.6, 112, 72, 78, 98, false, NULL),
    ('a16', 14, 85.0, 175.0, 36.6, 125, 82, 76, 98, false, NULL),
    ('a17', 15, 84.5, 175.0, 38.9, 122, 80, 98, 96, false, NULL),
    ('a18', 12, 55.0, 162.0, 36.5, 108, 70, 72, 99, false, NULL),
    ('a22', 20, 90.0, 171.0, 37.0, 160, 100, 88, 96, false, NULL),
    ('a23', 16, 70.0, 156.0, 36.8, 128, 84, 80, 97, false, NULL),
    ('a24', 15, 9.4, 75.0, 36.6, NULL, NULL, 125, 98, false, NULL),
    ('a26', 16, 80.0, 169.0, 36.7, 145, 92, 82, 96, false, NULL),
    ('a27', 13, 11.0, 88.0, 36.5, NULL, NULL, 115, 98, false, NULL),
    ('a28', 18, 60.0, 160.0, 36.6, 110, 70, 75, 99, false, NULL),
    ('a29', 14, 38.0, 145.0, 36.8, 105, 65, 85, 99, false, NULL),
    ('a30', 13, 57.0, 161.0, 39.2, 100, 60, 112, 94, true, 'Fiebre alta y taquicardia (dato de prueba)')
) AS d (atencion, minuto, peso, talla, temperatura, sistolica, diastolica, frecuencia, saturacion, peligro, detalle)
JOIN tmp_atenciones ta ON ta.clave = d.atencion
JOIN usuarios u ON u.nombre_usuario = 'psignos';

-- Corrección versionada: se desactiva la fila anterior y se inserta la nueva con corrige_a.
UPDATE signos_vitales sv
SET vigente = false
FROM tmp_atenciones ta
WHERE ta.clave = 'a12' AND sv.id_atencion = ta.id_atencion AND sv.vigente;

INSERT INTO signos_vitales (id_atencion, peso_kg, talla_cm, temperatura_c, presion_sistolica,
                            presion_diastolica, frecuencia_cardiaca, saturacion_oxigeno,
                            hay_signos_peligro, id_usuario, corrige_a, fecha_creacion)
SELECT sv.id_atencion, 72.0, sv.talla_cm, sv.temperatura_c, sv.presion_sistolica,
       sv.presion_diastolica, sv.frecuencia_cardiaca, sv.saturacion_oxigeno,
       sv.hay_signos_peligro, sv.id_usuario, sv.id_signo_vital,
       ta.fecha_hora_llegada + interval '20 minutes'
FROM tmp_atenciones ta
JOIN signos_vitales sv ON sv.id_atencion = ta.id_atencion AND NOT sv.vigente
WHERE ta.clave = 'a12';

-- Consultas y diagnósticos ---------------------------------------------------------

WITH datos (atencion, minuto, usuario, tipo_consulta, motivo, historia, semana_gestacion,
            conducta, problemas, referido_a) AS (
    VALUES
    ('a01', 45, 'pdoctor', 'primera', 'Dolor de cabeza frecuente', 'Cefalea de una semana de evolución.', NULL::smallint, 'Dieta baja en sal. Control de presión en 2 semanas.', 'Presión arterial elevada', NULL::text),
    ('a02', 50, 'pdoctora', 'primera', 'Tos y congestión nasal', 'Tres días con tos seca.', NULL, 'Líquidos abundantes y reposo.', NULL, NULL),
    ('a03', 60, 'pdoctor', 'control', 'Control de glucosa', 'Paciente conocida con diabetes.', NULL, 'Continuar tratamiento. Control en 1 mes.', NULL, NULL),
    ('a06', 50, 'pdoctora', 'primera', 'Fiebre de dos días', 'Fiebre y secreción nasal.', NULL, 'Acetaminofén según peso. Se envía a vacunación por esquema atrasado.', 'Esquema de vacunación incompleto', NULL),
    ('a07', 45, 'pdoctor', 'primera', 'Orientación sobre planificación familiar', NULL, NULL, 'Consejería sobre métodos disponibles.', NULL, NULL),
    ('a08', 50, 'pdoctor', 'control', 'Control de presión arterial', 'Refiere menos dolor de cabeza.', NULL, 'Continuar tratamiento. Control en 1 mes.', NULL, NULL),
    ('a11', 45, 'pdoctora', 'primera', 'Herida en antebrazo', 'Herida por objeto cortante hace una hora.', NULL, 'Limpieza y sutura. Cuidados de la herida.', NULL, NULL),
    ('a12', 55, 'pdoctor', 'reconsulta', 'Dolor abdominal', 'Ardor en la boca del estómago después de comer.', NULL, 'Dieta blanda.', NULL, NULL),
    ('a14', 50, 'pdoctor', 'primera', 'Ardor al orinar', 'Tres días con molestias urinarias.', 20, 'Abundantes líquidos. Control prenatal en 4 semanas.', 'Embarazo de 20 semanas', NULL),
    ('a15', 50, 'pdoctora', 'reconsulta', 'Seguimiento de molestias urinarias', NULL, NULL, 'Abundantes líquidos.', NULL, NULL),
    ('a16', 45, 'pdoctor', 'primera', 'Dolor de espalda baja', 'Después de cargar peso.', NULL, 'Reposo relativo y calor local.', NULL, NULL),
    ('a17', 40, 'pdoctora', 'primera', 'Fiebre y dolor de garganta', NULL, NULL, 'Líquidos y reposo.', NULL, NULL),
    ('a18', 40, 'pdoctora', 'primera', 'Orientación sobre planificación familiar', NULL, NULL, 'Consejería sobre métodos disponibles.', NULL, NULL),
    ('a26', 60, 'pdoctor', 'primera', 'Dolor de estómago', 'Dolor abdominal difuso de una semana.', NULL, 'Desparasitante y control de presión.', 'Presión arterial elevada', NULL),
    ('a29', 70, 'pdoctor', 'primera', 'Dolor de oído', 'Dolor de oído derecho de dos días.', NULL, 'Calor local. Regresar si persiste.', NULL, NULL),
    ('a30', 40, 'pdoctora', 'primera', 'Fiebre alta', 'Fiebre de 39 grados desde ayer.', NULL, 'Se refiere para evaluación.', NULL, 'Hospital de referencia (dato de prueba)')
),
ins AS (
    INSERT INTO consultas (id_atencion, id_usuario, tipo_consulta, motivo_consulta, historia_enfermedad,
                           semana_gestacion, conducta_tratamiento, problemas_identificados, referido_a,
                           fecha_creacion)
    SELECT ta.id_atencion, u.id_usuario, d.tipo_consulta, d.motivo, d.historia, d.semana_gestacion,
           d.conducta, d.problemas, d.referido_a, ta.fecha_hora_llegada + d.minuto * interval '1 minute'
    FROM datos d
    JOIN tmp_atenciones ta ON ta.clave = d.atencion
    JOIN usuarios u ON u.nombre_usuario = d.usuario
    RETURNING id_consulta, id_atencion
)
INSERT INTO tmp_consultas (clave_atencion, id_consulta)
SELECT ta.clave, i.id_consulta
FROM ins i
JOIN tmp_atenciones ta ON ta.id_atencion = i.id_atencion;

INSERT INTO diagnosticos_consulta (id_consulta, descripcion_diagnostico, codigo_cie10, fecha_creacion)
SELECT tc.id_consulta, d.descripcion, d.cie10, c.fecha_creacion
FROM (VALUES
    ('a01', 'Hipertensión arterial', 'I10'),
    ('a02', 'Resfriado común', 'J00'),
    ('a03', 'Diabetes mellitus tipo 2', 'E11.9'),
    ('a06', 'Infección aguda de vías respiratorias superiores', 'J06.9'),
    ('a07', 'Consejería en anticoncepción', 'Z30.0'),
    ('a08', 'Hipertensión arterial', 'I10'),
    ('a11', 'Herida del antebrazo', 'S51.9'),
    ('a12', 'Gastritis', 'K29.7'),
    ('a14', 'Infección de vías urinarias', 'N39.0'),
    ('a15', 'Infección de vías urinarias', 'N39.0'),
    ('a16', 'Lumbago', 'M54.5'),
    ('a17', 'Faringitis aguda', 'J02.9'),
    ('a18', 'Consejería en anticoncepción', 'Z30.0'),
    ('a26', 'Parasitosis intestinal', 'B82.9'),
    ('a26', 'Hipertensión arterial', 'I10'),
    ('a29', 'Otitis media', 'H66.9'),
    ('a30', 'Fiebre sin causa aparente', NULL)
) AS d (atencion, descripcion, cie10)
JOIN tmp_consultas tc ON tc.clave_atencion = d.atencion
JOIN consultas c ON c.id_consulta = tc.id_consulta;

-- Recetas (doctor y una de nutrición) ----------------------------------------------

WITH datos (atencion, id_area, usuario, minuto) AS (
    VALUES
    ('a01', 3, 'pdoctor', 45),
    ('a03', 3, 'pdoctor', 60),
    ('a05', 4, 'pnutricion', 55),
    ('a08', 3, 'pdoctor', 50),
    ('a26', 3, 'pdoctor', 60)
),
ins AS (
    INSERT INTO recetas (id_atencion, id_area, id_usuario, fecha_creacion)
    SELECT ta.id_atencion, d.id_area, u.id_usuario, ta.fecha_hora_llegada + d.minuto * interval '1 minute'
    FROM datos d
    JOIN tmp_atenciones ta ON ta.clave = d.atencion
    JOIN usuarios u ON u.nombre_usuario = d.usuario
    RETURNING id_receta, id_atencion
)
INSERT INTO tmp_recetas (clave_atencion, id_receta)
SELECT ta.clave, i.id_receta
FROM ins i
JOIN tmp_atenciones ta ON ta.id_atencion = i.id_atencion;

INSERT INTO recetas_detalle (id_receta, id_medicamento, cantidad_recetada, indicaciones, fecha_creacion)
SELECT tr.id_receta, m.id_medicamento, d.cantidad, d.indicaciones, r.fecha_creacion
FROM (VALUES
    ('a01', 'Losartán', 'tableta', '50 mg', 30, 'Una tableta cada 24 horas'),
    ('a03', 'Metformina', 'tableta', '850 mg', 60, 'Una tableta cada 12 horas con alimentos'),
    ('a05', 'Sulfato ferroso', 'gotas', '125 mg/ml', 1, 'Diez gotas cada 24 horas'),
    ('a08', 'Losartán', 'tableta', '50 mg', 30, 'Una tableta cada 24 horas'),
    ('a08', 'Acetaminofén', 'tableta', '500 mg', 10, 'Una tableta cada 8 horas si hay dolor'),
    ('a26', 'Albendazol', 'tableta', '400 mg', 1, 'Dosis única'),
    ('a26', 'Losartán', 'tableta', '50 mg', 30, 'Una tableta cada 24 horas')
) AS d (atencion, medicamento, presentacion, concentracion, cantidad, indicaciones)
JOIN tmp_recetas tr ON tr.clave_atencion = d.atencion
JOIN recetas r ON r.id_receta = tr.id_receta
JOIN presentaciones p ON p.nombre_presentacion = d.presentacion
JOIN medicamentos m ON m.nombre_medicamento = d.medicamento
                   AND m.id_presentacion = p.id_presentacion
                   AND m.concentracion = d.concentracion;

-- Próximos controles ---------------------------------------------------------------

INSERT INTO proximos_controles (id_paciente, id_atencion, id_area, descripcion, fecha_sugerida,
                                estado, id_usuario, fecha_creacion)
SELECT tp.id_paciente, ta.id_atencion, d.id_area, d.descripcion,
       ta.fecha_hora_llegada::date + d.dias, d.estado, u.id_usuario,
       ta.fecha_hora_llegada + d.minuto * interval '1 minute'
FROM (VALUES
    ('p01', 'a01', 3, 'Control de presión arterial en 2 semanas', 14, 'cumplido', 'pdoctor', 45),
    ('p01', 'a08', 3, 'Control de presión arterial en 1 mes', 30, 'pendiente', 'pdoctor', 50),
    ('p03', 'a03', 3, 'Control de glucosa en 1 mes', 30, 'pendiente', 'pdoctor', 60),
    ('p10', 'a04', 5, 'Siguiente dosis según esquema de vacunación', 60, 'pendiente', 'pvacunacion', 35),
    ('p11', 'a05', 4, 'Control nutricional en 1 mes', 30, 'pendiente', 'pnutricion', 55),
    ('p12', 'a06', 5, 'Completar esquema de vacunación', 30, 'cancelado', 'pdoctora', 50),
    ('p20', 'a14', 3, 'Control prenatal en 4 semanas', 28, 'pendiente', 'pdoctor', 50)
) AS d (paciente, atencion, id_area, descripcion, dias, estado, usuario, minuto)
JOIN tmp_pacientes tp ON tp.clave = d.paciente
JOIN tmp_atenciones ta ON ta.clave = d.atencion
JOIN usuarios u ON u.nombre_usuario = d.usuario;

-- Unión de duplicados: p21 (sin CUI) se une a p20 -----------------------------------

INSERT INTO uniones_pacientes (id_paciente, id_paciente_unido, motivo, datos_unido, id_usuario, fecha_hora)
SELECT pc.id_paciente, pu.id_paciente,
       'Misma persona registrada dos veces; el segundo registro no tenía CUI (dato de prueba)',
       to_jsonb(p), u.id_usuario, current_date - 7 + time '10:00'
FROM tmp_pacientes pc
JOIN tmp_pacientes pu ON pu.clave = 'p21'
JOIN pacientes p ON p.id_paciente = pu.id_paciente
JOIN usuarios u ON u.nombre_usuario = 'precepcion'
WHERE pc.clave = 'p20';

UPDATE pacientes p
SET id_paciente_principal = pc.id_paciente
FROM tmp_pacientes pc, tmp_pacientes pu
WHERE pc.clave = 'p20' AND pu.clave = 'p21' AND p.id_paciente = pu.id_paciente;

-- El historial se consolida en el registro conservado.
UPDATE atenciones a
SET id_paciente = pc.id_paciente
FROM tmp_pacientes pc, tmp_pacientes pu
WHERE pc.clave = 'p20' AND pu.clave = 'p21' AND a.id_paciente = pu.id_paciente;

-- Evento de unión como lo anotará el backend.
INSERT INTO bitacora (fecha_hora, id_usuario, accion, entidad, id_registro, valor_nuevo, detalle)
SELECT un.fecha_hora, un.id_usuario, 'unir', 'pacientes', un.id_paciente,
       jsonb_build_object('id_paciente_unido', un.id_paciente_unido), un.motivo
FROM uniones_pacientes un
JOIN tmp_pacientes pu ON pu.clave = 'p21' AND pu.id_paciente = un.id_paciente_unido;

DROP TABLE tmp_municipios, tmp_pacientes, tmp_encargados, tmp_atenciones, tmp_consultas, tmp_recetas;
