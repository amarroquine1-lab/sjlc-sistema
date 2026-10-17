-- Migración 026: administración atiende un paciente por área; los roles operativos, uno solo.
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE
    adm integer := (SELECT u.id_usuario FROM usuarios u JOIN roles r USING (id_rol) WHERE r.nombre_rol = 'administrador' AND u.nombre_usuario <> 'sistema' ORDER BY 1 LIMIT 1);
    a1 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); a2 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) VALUES (a1, 2, now(), adm);
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) SELECT a2, 3, now(), adm; END $q$$t$, 'administración puede tener un paciente en atención en dos áreas a la vez');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE
    adm integer := (SELECT u.id_usuario FROM usuarios u JOIN roles r USING (id_rol) WHERE r.nombre_rol = 'administrador' AND u.nombre_usuario <> 'sistema' ORDER BY 1 LIMIT 1);
    a1 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); a2 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) VALUES (a1, 2, now(), adm);
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) VALUES (a2, 2, now(), adm); END $q$$t$, '23505', 'administración no atiende a dos pacientes en la misma área');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE
    op integer := (SELECT u.id_usuario FROM usuarios u JOIN roles r USING (id_rol) WHERE r.nombre_rol <> 'administrador' AND u.nombre_usuario <> 'sistema' ORDER BY 1 LIMIT 1);
    a1 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); a2 integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) VALUES (a1, 2, now(), op);
    INSERT INTO recorridos_atencion (id_atencion, id_area, fecha_hora_inicio, id_usuario) SELECT a2, 3, now(), op; END $q$$t$, '23505', 'un rol operativo no atiende a dos pacientes aunque sean de áreas distintas');
