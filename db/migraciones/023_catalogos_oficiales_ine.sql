-- 023: catálogos oficiales del Censo 2018 del INE para pueblo y comunidad lingüística.
-- Los códigos de los datos (seed-produccion.sql) siguen la boleta censal; esta migración solo
-- acomoda lo que ya existiera con la numeración provisional anterior:
--   * "No indica" deja de ser el código 23 (que en el INE es Xinka) y pasa al 99, que es el valor por omisión.
--   * K'iche' (10) y Kaqchikel (11) estaban intercambiados.
--   * Pueblo: 4 pasa de "Mestizo/Ladino" a Afrodescendiente/Creole/Afromestizo y el ladino es el 5; el 6 es Extranjero.
-- En una base nueva (sin catálogos todavía) no hace más que fijar el valor por omisión.

-- "No indica" al código 99 (el nombre es único: el 23 anterior se renombra primero)
UPDATE comunidades_linguisticas SET nombre_comunidad_linguistica = 'No indica (anterior)'
 WHERE id_comunidad_linguistica = 23 AND nombre_comunidad_linguistica = 'No indica';
INSERT INTO comunidades_linguisticas (id_comunidad_linguistica, nombre_comunidad_linguistica) VALUES (99, 'No indica')
ON CONFLICT DO NOTHING;
UPDATE pacientes SET id_comunidad_linguistica = 99 WHERE id_comunidad_linguistica = 23
   AND EXISTS (SELECT 1 FROM comunidades_linguisticas WHERE id_comunidad_linguistica = 23 AND nombre_comunidad_linguistica = 'No indica (anterior)');
ALTER TABLE pacientes ALTER COLUMN id_comunidad_linguistica SET DEFAULT 99;

-- K'iche' y Kaqchikel: se intercambian los pacientes y los nombres (con un nombre temporal por la unicidad)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM comunidades_linguisticas WHERE id_comunidad_linguistica = 10 AND nombre_comunidad_linguistica = 'Kaqchikel')
       AND EXISTS (SELECT 1 FROM comunidades_linguisticas WHERE id_comunidad_linguistica = 11 AND nombre_comunidad_linguistica = 'K''iche''') THEN
        UPDATE pacientes SET id_comunidad_linguistica = CASE id_comunidad_linguistica WHEN 10 THEN 11 ELSE 10 END WHERE id_comunidad_linguistica IN (10, 11);
        UPDATE comunidades_linguisticas SET nombre_comunidad_linguistica = 'temporal-' || id_comunidad_linguistica WHERE id_comunidad_linguistica IN (10, 11);
        UPDATE comunidades_linguisticas SET nombre_comunidad_linguistica = 'K''iche''' WHERE id_comunidad_linguistica = 10;
        UPDATE comunidades_linguisticas SET nombre_comunidad_linguistica = 'Kaqchikel' WHERE id_comunidad_linguistica = 11;
    END IF;
END
$$;

-- Pueblo: el ladino pasa del 4 al 5; lo que era "Otro" (5) queda sin pueblo
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pueblos WHERE id_pueblo = 4 AND nombre_pueblo = 'Mestizo/Ladino') THEN
        UPDATE pacientes SET id_pueblo = NULL WHERE id_pueblo = 5;
        UPDATE pacientes SET id_pueblo = 5 WHERE id_pueblo = 4;
    END IF;
END
$$;
