-- Restricciones de pacientes, encargados y uniones.
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,cui,id_usuario) VALUES ('A','B','1990-01-01','F','123456789012',pg_temp.uid('precepcion'))$t$, '23514', 'CUI de 12 dígitos se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,cui,id_usuario) VALUES ('A','B','1990-01-01','F','12345678901AB',pg_temp.uid('precepcion'))$t$, '23514', 'CUI con letras se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ BEGIN PERFORM pg_temp.nuevo_paciente('4999999990101'); PERFORM pg_temp.nuevo_paciente('4999999990101'); END $q$$t$, '23505', 'CUI repetido se rechaza');
SELECT pg_temp.debe_pasar($t$DO $q$ BEGIN PERFORM pg_temp.nuevo_paciente(NULL); PERFORM pg_temp.nuevo_paciente(NULL); END $q$$t$, 'dos pacientes sin CUI conviven (menores)');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B','1990-01-01','X',pg_temp.uid('precepcion'))$t$, '23514', 'sexo distinto de F o M se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES ('A','B',current_date + 1,'F',pg_temp.uid('precepcion'))$t$, '23514', 'fecha de nacimiento futura se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) VALUES (NULL,'B','1990-01-01','F',pg_temp.uid('precepcion'))$t$, '23514', 'paciente normal sin nombres se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,sexo,edad_aproximada_anios,id_usuario) VALUES ('A','B','F',30,pg_temp.uid('precepcion'))$t$, '23514', 'paciente normal sin fecha de nacimiento se rechaza');
SELECT pg_temp.debe_pasar($t$INSERT INTO pacientes (sexo,edad_aproximada_anios,datos_incompletos,id_usuario) VALUES ('M',35,true,pg_temp.uid('precepcion'))$t$, 'emergencia: sin nombres ni fecha pero con edad aproximada');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (sexo,datos_incompletos,id_usuario) VALUES ('M',true,pg_temp.uid('precepcion'))$t$, '23514', 'emergencia sin fecha ni edad aproximada se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (sexo,edad_aproximada_anios,datos_incompletos,id_usuario) VALUES ('M',121,true,pg_temp.uid('precepcion'))$t$, '23514', 'edad aproximada mayor a 120 se rechaza');
SELECT pg_temp.debe_fallar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_municipio_residencia,id_usuario) VALUES ('A','B','1990-01-01','F',32000,pg_temp.uid('precepcion'))$t$, '23503', 'municipio inexistente se rechaza');
SELECT pg_temp.debe_pasar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_municipio_residencia,id_usuario) VALUES ('A','B','1990-01-01','F',108,pg_temp.uid('precepcion'))$t$, 'paciente de Mixco (108) se acepta');
SELECT pg_temp.debe_pasar($t$INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_municipio_residencia,id_usuario) VALUES ('A','B','1990-01-01','F',2217,pg_temp.uid('precepcion'))$t$, 'paciente de otro municipio se acepta (excepciones y SIGSA)');
SELECT pg_temp.debe_fallar($t$UPDATE pacientes SET id_paciente_principal = id_paciente WHERE id_paciente = (SELECT min(id_paciente) FROM pacientes)$t$, '23514', 'un paciente no puede ser su propio registro principal');
SELECT pg_temp.verificar((SELECT count(*) FROM pacientes WHERE codigo_paciente !~ '^SJLC-[0-9]{6,}$') = 0, 'todos los códigos de paciente tienen formato SJLC-NNNNNN');
SELECT pg_temp.verificar((SELECT id_comunidad_linguistica FROM pacientes ORDER BY id_paciente DESC LIMIT 1) IS NOT NULL, 'la comunidad lingüística nunca es nula (por omisión 99)');
SELECT pg_temp.debe_fallar($t$INSERT INTO encargados (nombres,apellidos,dpi) VALUES ('A','B','123456789012')$t$, '23514', 'DPI de encargado de 12 dígitos se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); e1 integer; e2 integer; BEGIN
    INSERT INTO encargados (nombres,apellidos) VALUES ('A','B') RETURNING id_encargado INTO e1;
    INSERT INTO encargados (nombres,apellidos) VALUES ('C','D') RETURNING id_encargado INTO e2;
    INSERT INTO pacientes_encargados VALUES (p, e1, 'Madre', true);
    INSERT INTO pacientes_encargados VALUES (p, e2, 'Padre', true); END $q$$t$, '23505', 'solo un encargado principal por paciente');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE p integer := pg_temp.nuevo_paciente(); e1 integer; e2 integer; BEGIN
    INSERT INTO encargados (nombres,apellidos) VALUES ('A','B') RETURNING id_encargado INTO e1;
    INSERT INTO encargados (nombres,apellidos) VALUES ('C','D') RETURNING id_encargado INTO e2;
    INSERT INTO pacientes_encargados VALUES (p, e1, 'Madre', true);
    INSERT INTO pacientes_encargados VALUES (p, e2, 'Padre', false);
    INSERT INTO pacientes (nombres,apellidos,fecha_nacimiento,sexo,id_usuario) SELECT 'Hermano','Prueba','2020-01-01','M',pg_temp.uid('precepcion');
    END $q$$t$, 'un encargado puede ser de varios pacientes y un paciente tener varios encargados');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,a,'duplicado','{}',pg_temp.uid('precepcion')); END $q$$t$, '23514', 'no se puede unir un paciente consigo mismo');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'   ','{}',pg_temp.uid('precepcion')); END $q$$t$, '23514', 'la unión exige un motivo no vacío');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); c integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'duplicado','{}',pg_temp.uid('precepcion'));
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (c,b,'duplicado','{}',pg_temp.uid('precepcion')); END $q$$t$, '23505', 'un registro solo puede ser absorbido una vez');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente registrado dos veces','{"x":1}',pg_temp.uid('precepcion')); END $q$$t$, 'unión válida con motivo');
SELECT pg_temp.cerrar();
