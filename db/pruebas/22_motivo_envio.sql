-- Migración 022: motivo opcional al enviar un paciente a otra área.
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,motivo_envio) VALUES (at,3,'Lo pidió la doctora'); END $q$$t$, 'un tramo puede llevar el motivo del envío');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area) VALUES (at,3); END $q$$t$, 'el motivo es opcional');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,motivo_envio) VALUES (at,3,'   '); END $q$$t$, '23514', 'un motivo en blanco se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE at integer := pg_temp.nueva_atencion(pg_temp.nuevo_paciente()); BEGIN
    INSERT INTO recorridos_atencion (id_atencion,id_area,motivo_envio) VALUES (at,3,repeat('x',201)); END $q$$t$, '23514', 'el motivo no pasa de 200 letras');
