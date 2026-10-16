-- medios_pago.csv : detalle de medios de cada recibo / orden de pago (PGODET).
-- PGODET no tiene UTRANSAC: la baja se hereda del comprobante.
SELECT d.ID                              AS vientri_id,
       d.IDCMP                           AS id_cmp,
       d.IDCODIMP                        AS id_medio,
       d.IMPORTE                         AS importe,
       d.COTIZ_DIVISA                    AS cotizacion,
       d.IDCHQ                           AS id_cheque,
       d.IDCMPRETPER                     AS id_retencion,
       d.IDCMPDEPTRA                     AS id_deposito_transf,
       d.IDCMP_RELACIONADO               AS id_cmp_relacionado,
       CONVERT(char(19), d.FECINS, 126)  AS fecins,
       CONVERT(char(19), d.FECSYS, 126)  AS fecsys
FROM PGODET d
WHERE (@desde IS NOT NULL AND d.FECSYS > @desde)
   OR (@desde IS NULL AND EXISTS (SELECT 1 FROM CMP c
                                  WHERE c.ID = d.IDCMP AND c.IDPER_EMPRESA = 1
                                    AND (c.FEC_CMP >= '20250101' OR c.ABIERTO = 1 OR c.IMPORTEPENDIENTE <> 0)));
