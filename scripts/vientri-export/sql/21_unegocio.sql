-- unegocio.csv : catalogo de unidades de negocio (tabla UNEGOCIO). Chico y casi fijo: se exporta
-- completo siempre (no usa @desde) para que nunca falte un nombre en el tablero de Ventas.
SELECT u.ID                            AS vientri_id,
       RTRIM(u.DES)                    AS des,
       CONVERT(char(19), u.FECSYS, 126) AS fecsys
FROM UNEGOCIO u;
