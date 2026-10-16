-- tipos_comprobante.csv : resumen para armar el catalogo de tipos (no hay tabla TCMP en SGA_BACAR).
-- Sin datos personales: solo conteos.
SELECT c.IDTCMP                                        AS id_tipo,
       RTRIM(c.NOMCMP)                                 AS nom_tipo,
       COUNT(*)                                        AS cantidad,
       SUM(CASE WHEN c.ABIERTO = 1 THEN 1 ELSE 0 END)  AS abiertos,
       SUM(CASE WHEN c.IMPORTEPENDIENTE <> 0 THEN 1 ELSE 0 END) AS con_pendiente,
       SUM(CASE WHEN pr.ID IS NOT NULL THEN 1 ELSE 0 END) AS a_proveedores,
       SUM(CASE WHEN cl.ID IS NOT NULL THEN 1 ELSE 0 END) AS a_clientes,
       SUM(c.TOTAL)                                    AS total,
       CONVERT(char(10), MIN(c.FEC_CMP), 23)           AS desde,
       CONVERT(char(10), MAX(c.FEC_CMP), 23)           AS hasta
FROM CMP c
OUTER APPLY (SELECT TOP 1 x.ID FROM PRO x WHERE x.IDPER = c.IDPER) pr
OUTER APPLY (SELECT TOP 1 y.ID FROM CLI y WHERE y.IDPER = c.IDPER) cl
WHERE c.IDPER_EMPRESA = 1 AND ISNULL(c.UTRANSAC, 'V') <> 'ELI' AND c.FEC_CMP >= '20250101'
  AND (@desde IS NULL OR @desde IS NOT NULL)
GROUP BY c.IDTCMP, RTRIM(c.NOMCMP);
