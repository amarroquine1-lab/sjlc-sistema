-- 022: motivo breve y opcional al enviar un paciente a otra área. Queda en el tramo de destino del recorrido
-- (por qué llegó ahí) y, como todo el recorrido, en la bitácora y en el historial.

ALTER TABLE recorridos_atencion ADD COLUMN motivo_envio text NULL;
ALTER TABLE recorridos_atencion ADD CONSTRAINT ck_recorridos_motivo_envio CHECK (motivo_envio IS NULL OR length(trim(motivo_envio)) BETWEEN 1 AND 200);

GRANT INSERT (motivo_envio) ON recorridos_atencion TO sjlc_app;
