-- compras_combustible.csv : facturas y notas de debito/credito de compra a proveedores de combustible
-- (estaciones de servicio, YPF, Shell, Axion, GNC, etc.), identificadas por el nombre del proveedor.
-- Solo para el tablero de Combustible de Bacarnet (gasto total por mes/proveedor/unidad de negocio,
-- SIN detalle por movil: eso se dejo de cargar en Vientri a fines de 2024, ver VALECOM).
-- Tipos incluidos: FAA/FCG (facturas) y ND*/NC* (notas de debito/credito). Quedan afuera a proposito
-- RMT (remitos), RCX (recibos de cobro) y OPA (ordenes de pago): no son el monto de la factura, son
-- documentos de entrega o de pago, y sumarlos duplicaria el gasto real.
-- Carga completa: desde 2025-01-01. Incremental: modificado despues de @desde.
SELECT c.ID                              AS vientri_id,
       RTRIM(c.NOMCMP)                   AS nom_tipo,
       CONVERT(char(10), c.FEC_CMP, 23)  AS fecha,
       c.IDPER                           AS id_proveedor,
       RTRIM(pe.DES)                     AS nombre_proveedor,
       c.TOTAL                           AS total,
       c.IDDIVISA                        AS id_divisa,
       c.IDUNEGOCIO                      AS id_unegocio,
       CASE WHEN c.UTRANSAC = 'ELI' THEN 1 ELSE 0 END AS baja,
       CONVERT(char(19), c.FECSYS, 126)  AS fecsys
FROM CMP c
JOIN PER pe ON pe.ID = c.IDPER
WHERE c.IDPER_EMPRESA = 1
  AND RTRIM(c.NOMCMP) IN ('FAA','FAB','FCG','FCB','NDA','NDB','NDX','NDP','NCA','NCB','NCX','NCG')
  AND (
       pe.DES LIKE '%COMBUST%' OR pe.DES LIKE '%NAFTA%' OR pe.DES LIKE '%GASOIL%' OR pe.DES LIKE '%DIESEL%'
    OR pe.DES LIKE '%ESTACION%SERVIC%' OR pe.DES LIKE '%GNC%' OR pe.DES LIKE '%YPF%' OR pe.DES LIKE '%SHELL%'
    OR pe.DES LIKE '%AXION%' OR pe.DES LIKE '%PETROBRAS%' OR pe.DES LIKE '%PETROLERA%' OR pe.DES LIKE '%OIL%'
  )
  AND (   (@desde IS NULL AND c.FEC_CMP >= '20250101')
       OR (@desde IS NOT NULL AND c.FECSYS > @desde));
