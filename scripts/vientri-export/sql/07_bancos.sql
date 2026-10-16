-- bancos.csv : catalogo de bancos (siempre completo, es chico).
SELECT b.ID                                            AS vientri_id,
       RTRIM(b.DES)                                    AS nombre,
       RTRIM(b.DESABR)                                 AS abreviatura,
       b.NROBC                                         AS codigo_bcra,
       b.CUIT                                          AS cuit,
       CONVERT(char(19), b.FECSYS, 126)                AS fecsys,
       CASE WHEN b.UTRANSAC = 'ELI' THEN 1 ELSE 0 END  AS baja
FROM BANCO b
WHERE @desde IS NULL OR @desde IS NOT NULL;
