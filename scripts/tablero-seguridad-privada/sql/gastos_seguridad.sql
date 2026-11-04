-- Movimientos contables de cuentas de gasto (CUE.GASTO = 1) del centro de costo "SERVICIO DE SEGURIDAD PRIVADA",
-- con la clasificacion oficial de rubro/subrubro del plan de cuentas de Vientri (no es una consulta que vaya al
-- zip diario de Bacarnet: es especifica de este generador, se corre a mano cuando hace falta refrescar el tablero).
-- Mismo criterio de "mes" que el resto de los tableros contables: el de la CABECERA del asiento (ASI.EFECTO).
-- No incluye el centro de costo "SEGURIDAD PLANTA" (cc distinto): ese no es Seguridad Privada.
DECLARE @ini date = DATEADD(MONTH, -24, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
IF @ini < '20241001' SET @ini = '20241001';
SELECT CONVERT(char(7), a.EFECTO, 23)       AS mes,
       RTRIM(u.COD)                         AS cod_cuenta,
       RTRIM(u.DES)                         AS cuenta,
       RTRIM(ISNULL(ru.DES, ''))            AS rubro,
       RTRIM(ISNULL(sr.DES, ''))            AS subrubro,
       SUM(d.DEBE - d.HABER)                AS importe
FROM ASIDET d
JOIN ASI a  ON a.ID = d.IDASI
JOIN CUE u  ON u.ID = d.IDCUE
LEFT JOIN CUE ru ON ru.ID = u.IDCUE_RUBRO
LEFT JOIN CUE sr ON sr.ID = u.IDCUE_SUBRUBRO
LEFT JOIN CCOSTO cc ON cc.ID = d.IDCCOSTO
WHERE a.IDPER_EMPRESA = 1
  AND u.GASTO = 1
  AND RTRIM(cc.DES) = 'SERVICIO DE SEGURIDAD PRIVADA'
  AND ISNULL(d.UTRANSAC, '') <> 'ELI' AND ISNULL(a.UTRANSAC, '') <> 'ELI'
  AND a.EFECTO >= @ini
GROUP BY CONVERT(char(7), a.EFECTO, 23), RTRIM(u.COD), RTRIM(u.DES), RTRIM(ISNULL(ru.DES, '')), RTRIM(ISNULL(sr.DES, ''))
ORDER BY mes, rubro, subrubro;
