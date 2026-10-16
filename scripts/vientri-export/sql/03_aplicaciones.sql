-- aplicaciones.csv : que comprobante cancela a cual (PGOCMP). Sirve para saldos y "con que se pago".
SELECT p.ID                                           AS vientri_id,
       p.IDCMP                                        AS id_cmp,
       p.IDCMP_CANCELA                                AS id_cmp_cancelado,
       p.IMPORTE                                      AS importe,
       RTRIM(p.CUOTA)                                 AS cuota,
       p.IDDIVISA                                     AS id_divisa,
       p.COTIZ_DIVISA                                 AS cotizacion,
       CONVERT(char(19), p.FECINS, 126)               AS fecins,
       CONVERT(char(19), p.FECSYS, 126)               AS fecsys,
       CASE WHEN p.UTRANSAC = 'ELI' THEN 1 ELSE 0 END AS baja
FROM PGOCMP p
WHERE (@desde IS NOT NULL AND p.FECSYS > @desde)
   OR (@desde IS NULL AND EXISTS (SELECT 1 FROM CMP c
                                  WHERE c.ID IN (p.IDCMP, p.IDCMP_CANCELA) AND c.IDPER_EMPRESA = 1
                                    AND (c.FEC_CMP >= '20250101' OR c.ABIERTO = 1 OR c.IMPORTEPENDIENTE <> 0)));
