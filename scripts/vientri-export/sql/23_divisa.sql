-- divisa.csv : catalogo de monedas (tabla DIVISA). Chico y fijo (confirmado: 1=Pesos $, 4=Dolares US,
-- y algunas marginales como CCL/MEP/euros/reales/libras/yuanes). Se exporta completo siempre.
-- Hasta ahora el simbolo de cada comprobante salia de cotizaciones.csv (cotizacion diaria del dolar),
-- que nunca tiene filas de Pesos: por eso los comprobantes en pesos quedaban con moneda=null.
SELECT d.ID                             AS vientri_id,
       RTRIM(d.SIMBOLO)                 AS simbolo,
       CONVERT(char(19), d.FECSYS, 126) AS fecsys
FROM DIVISA d;
