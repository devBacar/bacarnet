# Formato de número de cheques

## Cheque físico

Formato: `XXX-XXX-XXXX-XXXXXXXX`

| Segmento | Ejemplo | Significado | Dígitos |
|----------|---------|-------------|---------|
| 1° | 020 | Código de entidad bancaria (asignado por BCRA) | 3 |
| 2° | 350 | Código de sucursal (tipo de casa, asignado por el banco) | 3 |
| 3° | 5111 | Código postal del domicilio de pago | 4 |
| 4° | 39789005 | Número del cheque propiamente dicho | 8 |

Ejemplo completo: `020-350-5111-39789005`

## eCheq

Formato: `E-CHEQ XXXXXXXX`

Prefijo `E-CHEQ` seguido del número de cheque.

Ejemplo: `E-CHEQ 50093130`
