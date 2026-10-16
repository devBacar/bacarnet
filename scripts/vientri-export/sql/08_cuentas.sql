-- cuentas.csv : cuentas de disponibilidad (CUE) y medios de pago (CODIMP). Siempre completo.
SELECT 'CUE'                                           AS tipo,
       e.ID                                            AS vientri_id,
       RTRIM(e.COD)                                    AS codigo,
       RTRIM(e.DES)                                    AS descripcion,
       e.IDBANCO                                       AS id_banco,
       e.IDDIVISA                                      AS id_divisa,
       CAST(NULL AS int)                               AS id_cuenta_contable,
       CAST(NULL AS int)                               AS id_tipo_medio,
       ISNULL(e.DISPONIBILIDAD, 0)                     AS disponibilidad,
       CASE WHEN ISNULL(e.INACTIVA, 0) = 1 THEN 0 ELSE 1 END AS activo,
       CONVERT(char(10), e.CONCILIADAHASTA, 23)        AS conciliada_hasta,
       e.IDPER_EMPRESA                                 AS id_empresa,
       CONVERT(char(19), e.FECSYS, 126)                AS fecsys,
       CASE WHEN e.UTRANSAC = 'ELI' THEN 1 ELSE 0 END  AS baja
FROM CUE e
WHERE e.DISPONIBILIDAD = 1 AND (@desde IS NULL OR @desde IS NOT NULL)
UNION ALL
SELECT 'CODIMP', m.ID, CAST(NULL AS nvarchar(15)), RTRIM(m.DES), m.IDBANCO, m.IDDIVISA, m.IDCUE, m.IDTIPIMP,
       0, ISNULL(m.ACTIVO, 0), CAST(NULL AS char(10)), m.IDPER_EMPRESA,
       CONVERT(char(19), m.FECSYS, 126),
       CASE WHEN m.UTRANSAC = 'ELI' THEN 1 ELSE 0 END
FROM CODIMP m;
