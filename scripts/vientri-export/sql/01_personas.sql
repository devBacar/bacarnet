-- personas.csv : clientes, proveedores y personas que aparecen en cheques o comprobantes de BACAR.
-- Sin direcciones, telefonos, emails ni documentos (Ley 25.326).
-- @desde (datetime, NULL = carga completa) lo pasa exportar_vientri.ps1
WITH ids AS (
    SELECT IDPER AS id FROM CLI
    UNION SELECT IDPER FROM PRO
    UNION SELECT idper_emi     FROM Chq WHERE fecvto >= '20250101' OR encartera = 1
    UNION SELECT idper_entrega FROM Chq WHERE fecvto >= '20250101' OR encartera = 1
    UNION SELECT idper_recibe  FROM Chq WHERE fecvto >= '20250101' OR encartera = 1
    UNION SELECT IDPER_RECIBE  FROM CHQOCA WHERE FECVTO >= '20250101' OR ISNULL(PAGADO, 0) = 0
    UNION SELECT IDPER FROM CMP WHERE IDPER_EMPRESA = 1 AND (FEC_CMP >= '20250101' OR ABIERTO = 1)
    UNION SELECT 1
)
SELECT p.ID                                                        AS vientri_id,
       COALESCE(NULLIF(RTRIM(p.RAZON_SOCIAL), ''), RTRIM(p.DES))    AS nombre,
       RTRIM(p.NOMBREFANTASIA)                                     AS nombre_fantasia,
       REPLACE(REPLACE(RTRIM(p.CUIT), '-', ''), ' ', '')           AS cuit,
       CASE WHEN cl.ID IS NULL THEN 0 ELSE 1 END                   AS es_cliente,
       CASE WHEN pr.ID IS NULL THEN 0 ELSE 1 END                   AS es_proveedor,
       p.IDPER_EMPRESA                                             AS id_empresa,
       ISNULL(p.INACTIVO, 0)                                       AS inactivo,
       ISNULL(p.INCOBRABLE, 0)                                     AS incobrable,
       cl.LIMCRE                                                   AS cli_limite_credito,
       cl.PLAZO_PAGO                                               AS cli_plazo_pago_dias,
       CONVERT(char(10), cl.ULTPAG, 23)                            AS cli_ultimo_pago,
       cl.GESTIONCOBRANZAINTERNA                                   AS cli_gestion_interna,
       pr.PLAZO_PAGO                                               AS pro_plazo_pago_dias,
       RTRIM(pr.CBU)                                               AS pro_cbu,
       CONVERT(char(19), (SELECT MAX(f) FROM (VALUES (p.FECSYS), (cl.FECSYS), (pr.FECSYS)) v(f)), 126) AS fecsys,
       CASE WHEN p.UTRANSAC = 'ELI' THEN 1 ELSE 0 END              AS baja
FROM PER p
JOIN (SELECT DISTINCT id FROM ids WHERE id IS NOT NULL) i ON i.id = p.ID
OUTER APPLY (SELECT TOP 1 c.ID, c.LIMCRE, c.PLAZO_PAGO, c.ULTPAG, c.GESTIONCOBRANZAINTERNA, c.FECSYS
             FROM CLI c WHERE c.IDPER = p.ID AND ISNULL(c.UTRANSAC, 'V') <> 'ELI' ORDER BY c.ID DESC) cl
OUTER APPLY (SELECT TOP 1 x.ID, x.PLAZO_PAGO, x.CBU, x.FECSYS
             FROM PRO x WHERE x.IDPER = p.ID AND ISNULL(x.UTRANSAC, 'V') <> 'ELI' ORDER BY x.ID DESC) pr
WHERE @desde IS NULL OR p.FECSYS > @desde OR cl.FECSYS > @desde OR pr.FECSYS > @desde;
