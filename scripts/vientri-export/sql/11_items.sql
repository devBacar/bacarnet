-- items.csv : lineas de comprobante (tabla Vientri "items"), para el tablero de Ventas (por item facturable).
-- Mismo recorte que comprobantes.csv: solo items de comprobantes de BACAR (IDPER_EMPRESA = 1).
SELECT i.ID                                   AS vientri_id,
       i.IDCMP                                AS id_cmp,
       i.IDART                                AS id_art,
       i.CANTIDAD                             AS cantidad,
       i.IMPORTE                              AS importe,
       CONVERT(char(19), i.FECSYS, 126)       AS fecsys
FROM items i
JOIN CMP c ON c.ID = i.IDCMP
WHERE c.IDPER_EMPRESA = 1
  AND (   (@desde IS NULL AND (c.FEC_CMP >= '20250101' OR c.ABIERTO = 1 OR c.IMPORTEPENDIENTE <> 0))
       OR (@desde IS NOT NULL AND (i.FECSYS > @desde OR c.FECSYS > @desde)));
