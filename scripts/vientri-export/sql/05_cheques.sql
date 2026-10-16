-- cheques.csv : tabla Chq completa (recibidos de terceros Y cheques/echeqs propios de BACAR).
-- librador_es_bacar decide si en Bacarnet es "emitido" o "recibido" (regla verificada el 16/10/2026).
-- No se exportan firma ni cuenta del librador.
DECLARE @cuit_bacar varchar(20) = (SELECT REPLACE(REPLACE(RTRIM(CUIT), '-', ''), ' ', '') FROM PER WHERE ID = 1);

SELECT c.id                                                   AS vientri_id,
       RTRIM(c.nro)                                           AS numero,
       c.idbanco                                              AS id_banco,
       ISNULL(c.ECHEQ, 0)                                     AS echeq,
       ISNULL(c.CPD, 0)                                       AS cpd,
       REPLACE(REPLACE(RTRIM(c.CUIT), '-', ''), ' ', '')      AS cuit_librador,
       c.idper_emi                                            AS id_persona_librador,
       CASE WHEN c.idper_emi = 1
              OR REPLACE(REPLACE(RTRIM(c.CUIT), '-', ''), ' ', '') = @cuit_bacar
            THEN 1 ELSE 0 END                                 AS librador_es_bacar,
       c.idper_entrega                                        AS id_persona_entrega,
       c.idper_recibe                                         AS id_persona_recibe,
       CONVERT(char(10), c.fecemision, 23)                    AS fecha_emision,
       CONVERT(char(10), c.fecvto, 23)                        AS fecha_vto,
       CONVERT(char(10), c.recibido, 23)                      AS fecha_recibido,
       CONVERT(char(10), c.depositado, 23)                    AS fecha_deposito,
       CONVERT(char(10), c.entregado, 23)                     AS fecha_entregado,
       CONVERT(char(10), c.FECTEOACREDITACION, 23)            AS fecha_acred_teorica,
       c.importe                                              AS importe,
       ISNULL(c.encartera, 0)                                 AS en_cartera,
       ISNULL(c.RECHAZADO, 0)                                 AS rechazado,
       c.idestadoch                                           AS id_estado,
       c.IDESTADOCH_PREVIO                                    AS id_estado_previo,
       c.IDMOTIVORECHAZO                                      AS id_motivo_rechazo,
       c.IDCMP                                                AS id_cmp_ingreso,
       c.IDCMP_FINAL                                          AS id_cmp_salida,
       c.IDCMP_NDEBITO                                        AS id_cmp_nd_rechazo,
       c.IDCMP_PAGOBANCO                                      AS id_cmp_pago_banco,
       c.IDCODIMP                                             AS id_medio,
       c.IDPER_EMPRESA                                        AS id_empresa,
       CONVERT(char(19), c.FECINS, 126)                       AS fecins,
       CONVERT(char(19), c.fecsys, 126)                       AS fecsys,
       CASE WHEN c.utransac = 'ELI' THEN 1 ELSE 0 END         AS baja
FROM Chq c
WHERE ISNULL(c.IDPER_EMPRESA, 1) = 1
  AND (   (@desde IS NULL AND (c.fecvto >= '20250101' OR c.encartera = 1))
       OR (@desde IS NOT NULL AND c.fecsys > @desde));
