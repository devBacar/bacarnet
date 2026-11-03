-- art.csv : catalogo de articulos/items facturables (tabla ART). Se exporta completo siempre
-- (no usa @desde): son ~600 filas y casi no cambian, pero el tablero de Ventas necesita el nombre
-- de cualquier item que aparezca facturado, aunque sea viejo.
SELECT a.ID                             AS vientri_id,
       RTRIM(a.DES)                     AS des,
       CONVERT(char(19), a.FECSYS, 126) AS fecsys
FROM ART a;
