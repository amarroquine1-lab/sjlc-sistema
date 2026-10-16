-- Migración 012: uniones sin ciclos ni cadenas y atenciones solo en registros vigentes.
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (b,a,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b;
    UPDATE pacientes SET id_paciente_principal = b WHERE id_paciente = a; END $q$$t$, '23001', 'U-02: una unión en sentido opuesto (ciclo) se rechaza');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); c integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (b,c,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b;
    UPDATE pacientes SET id_paciente_principal = b WHERE id_paciente = c; END $q$$t$, '23001', 'U-02: no se unen registros a un registro ya absorbido (cadena)');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); c integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (c,a,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b;
    UPDATE pacientes SET id_paciente_principal = c WHERE id_paciente = a; END $q$$t$, '23001', 'U-02: quien ya conserva a otros no se puede unir a un tercero');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b; END $q$$t$, 'una unión simple sigue funcionando');
SELECT pg_temp.debe_fallar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); b integer := pg_temp.nuevo_paciente(); BEGIN
    INSERT INTO uniones_pacientes (id_paciente,id_paciente_unido,motivo,datos_unido,id_usuario) VALUES (a,b,'mismo paciente','{}',pg_temp.uid('precepcion'));
    UPDATE pacientes SET id_paciente_principal = a WHERE id_paciente = b;
    SET LOCAL ROLE sjlc_app; PERFORM set_config('sjlc.id_usuario', (SELECT id_usuario::text FROM usuarios WHERE nombre_usuario='precepcion'), true);
    INSERT INTO atenciones (id_paciente,id_tipo_atencion,estado,id_usuario) VALUES (b,(SELECT min(id_tipo_atencion) FROM tipos_atencion),'en_espera',(SELECT id_usuario FROM usuarios WHERE nombre_usuario='precepcion')); END $q$$t$, '23001', 'U-02: no se abre una atención sobre un registro absorbido');
SELECT pg_temp.debe_pasar($t$DO $q$ DECLARE a integer := pg_temp.nuevo_paciente(); BEGIN PERFORM pg_temp.nueva_atencion(a); END $q$$t$, 'el dueño (seeds y migraciones) queda exento');
SELECT pg_temp.cerrar();
