-- comprobantes.csv : cabecera de comprobantes de BACAR (facturas, NC, ND, recibos, ordenes de pago...).
-- Carga completa: desde 2025 o abiertos. Incremental: todo lo modificado despues de @desde.
SELECT c.ID                                              AS vientri_id,
       c.IDTCMP                                          AS id_tipo,
       RTRIM(c.NOMCMP)                                   AS nom_tipo,
       RTRIM(c.LET_CMP)                                  AS letra,
       c.SUC_CMP                                         AS punto_venta,
       c.NRO_CMP                                         AS numero,
       c.IDPER                                           AS id_persona,
       CONVERT(char(10), c.FEC_CMP, 23)                  AS fecha,
       CONVERT(char(10), c.EFECTO, 23)                   AS fecha_efecto,
       CONVERT(char(10), COALESCE(v.FEC_VTO, c.FEC_VTO), 23) AS fecha_vto,
       CONVERT(char(10), c.FEC_COB, 23)                  AS fecha_cobro,
       c.IDDIVISA                                        AS id_divisa,
       c.COTIZ_DIVISA                                    AS cotizacion,
       c.NETO                                            AS neto,
       c.IVA                                             AS iva,
       c.TOTAL                                           AS total,
       c.IMPORTEPENDIENTE                                AS importe_pendiente,
       ISNULL(c.ABIERTO, 0)                              AS abierto,
       c.IDCMPESTADO                                     AS id_estado,
       v.IDCMPESTADO_PROVEEDOR                           AS id_estado_proveedor,
       CONVERT(char(10), v.FEC_AUTORIZACION, 23)         AS fecha_autorizacion,
       c.IDFPGO                                          AS id_forma_pago,
       c.IDCUE                                           AS id_cuenta,
       c.IDCMP_ASO                                       AS id_cmp_asociado,
       CONVERT(char(10), v.FECHAPRONTOPAGO, 23)          AS fecha_pronto_pago,
       v.DTO1PRONTOPAGO                                  AS dto_pronto_pago,
       v.CUOTAS                                          AS cuotas,
       v.IMPORTECUOTA                                    AS importe_cuota,
       v.IDLINEAPRESTAMO                                 AS id_linea_prestamo,
       v.IMPORTEPENDIENTEALCANCELAR                      AS pendiente_prestamo,
       c.IDPER_EMPRESA                                   AS id_empresa,
       c.IDSUC                                           AS id_sucursal,
       ISNULL(c.MIGRACIONINICIAL, 0)                     AS migrado,
       CONVERT(char(19), c.FECINS, 126)                  AS fecins,
       CONVERT(char(19), CASE WHEN v.FECSYS > c.FECSYS THEN v.FECSYS ELSE c.FECSYS END, 126) AS fecsys,
       CASE WHEN c.UTRANSAC = 'ELI' THEN 1 ELSE 0 END    AS baja
FROM CMP c
OUTER APPLY (SELECT TOP 1 x.FEC_VTO, x.IDCMPESTADO_PROVEEDOR, x.FEC_AUTORIZACION, x.FECHAPRONTOPAGO, x.DTO1PRONTOPAGO,
                    x.CUOTAS, x.IMPORTECUOTA, x.IDLINEAPRESTAMO, x.IMPORTEPENDIENTEALCANCELAR, x.FECSYS
             FROM CMPVA x WHERE x.IDCMP = c.ID AND ISNULL(x.UTRANSAC, 'V') <> 'ELI' ORDER BY x.ID DESC) v
WHERE c.IDPER_EMPRESA = 1
  AND (   (@desde IS NULL AND (c.FEC_CMP >= '20250101' OR c.ABIERTO = 1))
       OR (@desde IS NOT NULL AND (c.FECSYS > @desde OR v.FECSYS > @desde)));
