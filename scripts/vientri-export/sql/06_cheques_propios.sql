-- cheques_propios.csv : cheques de papel emitidos por BACAR (CHQOCA) con datos de su chequera.
-- Se unen en Bacarnet con cheques.csv por numero + banco + importe (IDCHQ es poco confiable).
SELECT o.ID                                            AS vientri_id,
       RTRIM(o.NRO)                                    AS numero,
       RTRIM(o.NRO_COMPLETO)                           AS numero_completo,
       o.IDBANCO                                       AS id_banco,
       o.IDCHEQUERA                                    AS id_chequera,
       RTRIM(q.CTA)                                    AS cuenta_chequera,
       q.IDCODIMP                                      AS id_medio_chequera,
       o.IDPER_RECIBE                                  AS id_persona_recibe,
       RTRIM(o.DESTINATARIO)                           AS destinatario,
       CONVERT(char(10), o.FECEMISION, 23)             AS fecha_emision,
       CONVERT(char(10), o.FECVTO, 23)                 AS fecha_vto,
       o.IMPORTE                                       AS importe,
       ISNULL(o.PAGADO, 0)                             AS pagado,
       o.IDESTADOCH                                    AS id_estado,
       CONVERT(char(10), o.FEC_CONCILIADO, 23)         AS fecha_conciliado,
       o.IDCHQ                                         AS id_cheque,
       o.IDPER_EMPRESA                                 AS id_empresa,
       CONVERT(char(19), o.FECINS, 126)                AS fecins,
       CONVERT(char(19), o.FECSYS, 126)                AS fecsys,
       CASE WHEN o.UTRANSAC = 'ELI' THEN 1 ELSE 0 END  AS baja
FROM CHQOCA o
LEFT JOIN CHEQUERA q ON q.ID = o.IDCHEQUERA
WHERE ISNULL(o.IDPER_EMPRESA, 1) = 1
  AND (   (@desde IS NULL AND (o.FECVTO >= '20250101' OR ISNULL(o.PAGADO, 0) = 0))
       OR (@desde IS NOT NULL AND o.FECSYS > @desde));
