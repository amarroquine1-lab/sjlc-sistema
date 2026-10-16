-- Datos iniciales de producción. Se puede ejecutar varias veces sin duplicar.
-- No incluye departamentos ni municipios (seed-municipios.sql) ni medicamentos (pendientes de confirmar). Los usuarios administradores los crea
-- el sembrador desde .env.

INSERT INTO areas (id_area, nombre_area) VALUES
    (1, 'recepción'),
    (2, 'signos vitales'),
    (3, 'doctor'),
    (4, 'nutrición'),
    (5, 'vacunación'),
    (6, 'farmacia')
ON CONFLICT DO NOTHING;

-- Cada rol de área apunta a su área; administrador no tiene área.
INSERT INTO roles (id_rol, nombre_rol, id_area) VALUES
    (1, 'administrador', NULL),
    (2, 'recepcion', 1),
    (3, 'signos', 2),
    (4, 'doctor', 3),
    (5, 'nutricion', 4),
    (6, 'vacunacion', 5),
    (7, 'farmacia', 6)
ON CONFLICT DO NOTHING;

INSERT INTO tipos_atencion (id_tipo_atencion, nombre_tipo_atencion, es_emergencia) VALUES
    (1, 'consulta general', false),
    (2, 'vacunación', false),
    (3, 'nutrición directa', false),
    (4, 'planificación familiar', false),
    (5, 'emergencia', true)
ON CONFLICT DO NOTHING;

-- Pueblo y comunidad lingüística: códigos oficiales del Censo Nacional de Población y Vivienda 2018 del INE.
-- Fuente: boleta censal del INE (Guatemala), capítulo VII, pregunta PCP12 (pueblo, "según su origen o historia, cómo se
-- considera o auto identifica") y preguntas PCP13 y PCP15 (comunidades lingüísticas mayas 1 a 22; idiomas: 23 Xinka,
-- 24 Garífuna, 25 Español). Boleta publicada por el CELADE/CEPAL: https://celade.cepal.org/censosinfo/Boletas/GT_BDef_col_2018.pdf
-- El 99 ("No indica") no es del INE: es el valor por omisión del sistema cuando no se pregunta. Idempotente.
INSERT INTO pueblos (id_pueblo, nombre_pueblo) VALUES
    (1, 'Maya'),
    (2, 'Garífuna'),
    (3, 'Xinka'),
    (4, 'Afrodescendiente/Creole/Afromestizo'),
    (5, 'Ladina(o)'),
    (6, 'Extranjera(o)')
ON CONFLICT (id_pueblo) DO UPDATE SET nombre_pueblo = EXCLUDED.nombre_pueblo;

INSERT INTO comunidades_linguisticas (id_comunidad_linguistica, nombre_comunidad_linguistica) VALUES
    (1, 'Achi'''),
    (2, 'Akateka'),
    (3, 'Awakateka'),
    (4, 'Ch''orti'''),
    (5, 'Chalchiteka'),
    (6, 'Chuj'),
    (7, 'Itza'''),
    (8, 'Ixil'),
    (9, 'Jakalteka/Popti'''),
    (10, 'K''iche'''),
    (11, 'Kaqchikel'),
    (12, 'Mam'),
    (13, 'Mopan'),
    (14, 'Poqomam'),
    (15, 'Poqomchi'''),
    (16, 'Q''anjob''al'),
    (17, 'Q''eqchi'''),
    (18, 'Sakapulteka'),
    (19, 'Sipakapense'),
    (20, 'Tektiteka'),
    (21, 'Tz''utujil'),
    (22, 'Uspanteka'),
    (23, 'Xinka'),
    (24, 'Garífuna'),
    (25, 'Castellano'),
    (99, 'No indica')
ON CONFLICT (id_comunidad_linguistica) DO UPDATE SET nombre_comunidad_linguistica = EXCLUDED.nombre_comunidad_linguistica;

-- Presentaciones vistas en los formatos de farmacia; se completan con farmacia.
INSERT INTO presentaciones (id_presentacion, nombre_presentacion) VALUES
    (1, 'tableta'),
    (2, 'cápsula'),
    (3, 'frasco'),
    (4, 'gotas')
ON CONFLICT DO NOTHING;

-- Las identidades continúan después de los ids fijos.
SELECT setval(pg_get_serial_sequence('areas', 'id_area'), (SELECT max(id_area) FROM areas));
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), (SELECT max(id_rol) FROM roles));
SELECT setval(pg_get_serial_sequence('tipos_atencion', 'id_tipo_atencion'), (SELECT max(id_tipo_atencion) FROM tipos_atencion));
SELECT setval(pg_get_serial_sequence('presentaciones', 'id_presentacion'), (SELECT max(id_presentacion) FROM presentaciones));

-- Usuario "sistema" para las tareas automáticas (cierre del día): no puede ingresar (inactivo y sin contraseña usable)
-- y sirve para que los cambios del sistema queden en la bitácora con un actor real.
INSERT INTO usuarios (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash, debe_cambiar_contrasena, activo)
SELECT 'sistema', 'Sistema', 'Automatico', r.id_rol, '$argon2id$v=19$m=19456,t=2,p=1$ZGVzYWN0aXZhZG8$ZGVzYWN0aXZhZG9kZXNhY3RpdmFkbw', true, false
  FROM roles r WHERE r.nombre_rol = 'administrador'
ON CONFLICT (nombre_usuario) DO NOTHING;

-- Catálogo de vacunas PROVISIONAL (esquema habitual de niñez; pendiente de confirmar con la coordinadora, P9).
-- Los administradores pueden agregar o desactivar vacunas desde el sistema.
INSERT INTO vacunas (nombre_vacuna, dosis_totales) VALUES
    ('BCG', 1), ('Hepatitis B', 1), ('Pentavalente', 3), ('Polio', 3), ('Rotavirus', 2),
    ('Neumococo conjugada', 3), ('SPR (sarampión, paperas, rubéola)', 2), ('DPT refuerzo', 2),
    ('Influenza', NULL), ('Td (tétanos y difteria)', NULL)
ON CONFLICT (nombre_vacuna) DO NOTHING;
