-- cotizaciones.csv : dolar oficial diario desde 2025.
SELECT CONVERT(char(10), d.FECHA, 23)                  AS fecha,
       d.IDDIVISA                                      AS id_divisa,
       RTRIM(v.SIMBOLO)                                AS simbolo,
       d.COTIZ_DIVISA                                  AS cotizacion,
       CONVERT(char(19), d.FECSYS, 126)                AS fecsys,
       CASE WHEN d.UTRANSAC = 'ELI' THEN 1 ELSE 0 END  AS baja
FROM DOLAROFICIAL d
LEFT JOIN DIVISA v ON v.ID = d.IDDIVISA
WHERE d.FECHA >= '20250101' AND (@desde IS NULL OR d.FECSYS > @desde);
