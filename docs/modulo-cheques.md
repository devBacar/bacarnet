# Módulo Cheques — Chequera Virtual

Centraliza todos los movimientos de dinero por cheques: los que recibimos (a favor) y los que emitimos (egresos).

---

## Conceptos clave

### Dirección
| Valor | Significado |
|-------|-------------|
| `recibido` | Cheque a favor — dinero que entra |
| `emitido` | Cheque propio — dinero que sale (se debita) |

### Tipo
| Valor | Descripción |
|-------|-------------|
| `echeq` | Cheque electrónico (prefijo `E-CHEQ`) |
| `fisico` | Cheque papel (formato `XXX-XXX-XXXX-XXXXXXXX`) |

### Origen
| Valor | Descripción |
|-------|-------------|
| `cliente` | Cheque emitido por un cliente de BACAR |
| `tercero` | Cheque de un externo, no cliente directo |
| `propio` | Emitido por BACAR para pagar proveedores |

### Glosario de negocio

- **Utilizado**: el cheque ya fue usado — depositado, endosado o vendido. No es un estado en sí, sino un concepto paraguas. En el Excel de recibidos aparece como prefijo del campo Cheque (ej: `UTILIZADO 27/08/26 $103600.00 CH N° ...`). Se guarda como detalle en `observaciones`, y la fecha del prefijo se usa como fallback de `fechaPago` (vencimiento) si la columna Fec Vto está vacía.
- **En cartera**: el cheque todavía no fue utilizado — está disponible para depositar, vender o endosar.
- **Endosado**: alguien recibe un cheque, no lo cobra y lo usa para pagarle a otro.
- **Los estados vienen 100% de los Excel importados**, no hay carga manual de estados.

### Estados

**Recibidos** (del Excel "cheques recibidos"):
| Estado | Descripción |
|--------|-------------|
| `en_cartera` | Recibido, aún no depositado ni vendido |
| `depositado` | Depositado en banco |
| `vendido` | Vendido/endosado a un tercero |
| `rechazado` | Rechazado por el banco |

**Emitidos** (del reporte 488):
| Estado | Descripción |
|--------|-------------|
| `pendiente` | Emitido, aún no debitado |
| `debitado` | Ya se debitó de la cuenta (utilizado = true en el Excel) |
| `rechazado` | Rechazado (rechazado = true en el Excel) |

---

## Modelo de datos (colección `cheques`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `numero` | string | Número del cheque |
| `tipo` | `echeq` \| `fisico` | Tipo de cheque |
| `direccion` | `recibido` \| `emitido` | Entrada o salida de dinero |
| `origen` | `cliente` \| `tercero` \| `propio` | Quién lo originó |
| `montoCentavos` | number | Importe en centavos |
| `fechaEmision` | string (ISO) | Fecha de emisión |
| `fechaPago` | string (ISO) | Fecha de vencimiento/pago |
| `fechaRecibido` | string \| null | Fecha en que se recibió |
| `fechaEntregado` | string \| null | Fecha en que se entregó |
| `emisor` | string | Nombre del emisor |
| `emisorCuit` | string | CUIT del emisor |
| `bancoEmisor` | string \| null | Banco del emisor |
| `cliente` | string \| null | Cliente que entregó el cheque (recibidos) |
| `destinatario` | string \| null | A quién se le emitió (emitidos) |
| `endosante` | string \| null | Endosante (si aplica) |
| `estado` | ChequeEstado | Estado actual del cheque |
| `utilizado` | boolean \| null | Si fue utilizado — en emitidos viene del Excel, en recibidos se infiere del prefijo del blob Cheque |
| `cmc7` | string \| null | Código CMC7 (físicos) |
| `observaciones` | string \| null | Notas libres. En recibidos puede contener el detalle del prefijo del blob Cheque (ej: "Utilizado 2026-08-27") |
| `createdBy` | string | UID del usuario que lo cargó |
| `createdAt` | Timestamp | Fecha de creación |
| `updatedAt` | Timestamp | Última modificación |

---

## Import desde Excel

### Auto-detección de formato

El sistema escanea las primeras 20 filas buscando columnas clave:

- **Recibidos**: detecta columnas `cheque` + `cliente`
- **Emitidos (reporte 488)**: detecta columnas `nro` + `destinatario`

### Excel de recibidos (`cheques recibidos.xlsx`)

- Header en fila 5, datos desde fila 6
- El campo `Cheque` es un blob de texto con formato: `[UTILIZADO dd/mm/aa $monto] CH N° <numero> | <emisor> | <banco>`
  - El prefijo (`UTILIZADO`, `DEPOSITADO`, `VENDIDO`, `RECHAZADO`) es opcional — si está presente, se guarda como detalle en `observaciones` y la fecha como fallback de `fechaPago`
  - La parte `CH N°...` se parsea con regex para extraer número, emisor y banco
- Columnas usadas: Cheque, Cliente, Recibido, Entregado, Importe, Fec Vto, Estado
- **Debe y Haber se ignoran** — son partida doble contable del mismo importe. El mismo cheque aparece 2 veces en el Excel (una con Debe, otra con Haber). El parser agrupa por número y se queda con una sola fila.
- Fechas en formato español: `24-Set-2026` → se parsea con mapa de meses (Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Set/Sep, Oct, Nov, Dic)

### Excel de emitidos (`reporte-488.xls`)

- Header en fila 5, datos desde fila 6
- Columnas usadas: Nro, DmaFecEmision, DmaFecVto, Destinatario, Importe, Utilizado, Rechazado
- Fechas en formato ISO datetime
- Importe en pesos (se convierte a centavos)
- Estado se infiere: `rechazado` → rechazado, `utilizado` → debitado, sino → pendiente

### Deduplicación

Al importar (tanto Excel como pegado), se buscan cheques existentes por `direccion + numero`. Los duplicados se cuentan pero no se reinsertan. Esto permite reimportaciones periódicas del mismo Excel sin generar duplicados.

La búsqueda de duplicados se hace en batches de 30 números por query (límite de Firestore para operador `in`).

### Escritura en batches

Los cheques nuevos se insertan en batches de 400 documentos (límite de Firestore para batch writes).

---

## API (Backend)

Base: `/api/finanzas/cheques`

### `GET /`
Lista cheques con filtros y paginación.

**Query params:**
- `direccion`: `recibido` | `emitido` (opcional)
- `origen`: `cliente` | `tercero` | `propio` (opcional)
- `estado`: uno de los estados válidos (opcional)
- `tipo`: `echeq` | `fisico` (opcional)
- `desde`, `hasta`: rango de fecha de vencimiento, formato `AAAA-MM-DD` (opcional)
- `page`, `limit`: paginación (default 50, max 100)

**Respuesta:** incluye `total`, `totalCentavos`, `recibidosCentavos`, `emitidosCentavos` y array de `cheques`.

### `GET /resumen-diario`
Devuelve cantidad y total de cheques recibidos en cartera que vencen hoy (zona horaria Argentina).

### `POST /import`
Sube un archivo `.xlsx` o `.xls`. Auto-detecta formato y procesa todas las hojas.

**Body:** `multipart/form-data` con campo `file`.

**Respuesta:** `{ insertados, ignorados, duplicados, errores[] }`

### `POST /ingresar`
Ingresa cheques pegados desde la UI.

**Body JSON:**
```json
{
  "direccion": "recibido",
  "origen": "tercero",
  "rows": [
    {
      "numero": "E-CHEQ 50093130",
      "emisor": "EMPRESA SA",
      "fechaEmision": "2026-09-01",
      "fechaPago": "2026-10-15",
      "montoPesos": "150000",
      "tipo": "echeq",
      "cmc7": "",
      "endosante": "",
      "bancoEmisor": "BANCO NACION",
      "condicion": "En cartera"
    }
  ]
}
```

### `PATCH /:id/estado`
Cambia el estado de un cheque individual.

**Body:** `{ "estado": "depositado" }`

---

## Frontend

### Página: `ChequesPage.tsx`

**Tabs de dirección:** Todos / Recibidos / Emitidos — filtra la tabla y ajusta columnas visibles.

**Cards de resumen:**
- Total recibidos (verde)
- Total emitidos (rojo)
- Neto (recibidos - emitidos)

**Filtros adicionales:** tipo (eCheq/Físico), estado, origen, rango de vencimiento.

**Tabla adaptativa:**
- Vista "Todos": muestra badge de dirección y columna Contraparte
- Vista "Recibidos": muestra columnas Cliente, Debe, Haber
- Vista "Emitidos": oculta Cliente/Debe/Haber, muestra Destinatario

**Resumen diario:** card superior con cheques en cartera que vencen hoy.

### Modal de pegado

Permite pegar datos copiados de Excel (TSV). Detecta headers automáticamente. Incluye selector de dirección y origen del lote. Validación visual de filas (rojo si falta número o importe).

### Import Excel

Botón "Importar Excel" sube el archivo directo al endpoint `/import`. Muestra toast con resultados (insertados, duplicados, ignorados, errores).

---

## Archivos

```
backend/src/modules/finanzas/cheques/
├── domain/
│   └── cheque.types.ts          # Tipos, estados, labels
├── routes/
│   └── cheques.routes.ts        # Endpoints Express
└── services/
    ├── cheques.repository.ts    # Acceso a Firestore (CRUD, aggregates, dedup)
    └── cheques.service.ts       # Lógica: parsers Excel, validación, import

src/
├── pages/finanzas/
│   └── ChequesPage.tsx          # Página completa (tabla, filtros, modal)
└── services/
    └── finanzasChequesApi.ts    # Cliente API (fetch, tipos, labels)

docs/
└── formato-numero-cheques.md    # Formato de numeración física y eCheq
```

---

## Formato de numeración de cheques

### Físico: `XXX-XXX-XXXX-XXXXXXXX`
| Segmento | Dígitos | Significado |
|----------|---------|-------------|
| 1° | 3 | Código entidad bancaria (BCRA) |
| 2° | 3 | Código sucursal |
| 3° | 4 | Código postal domicilio de pago |
| 4° | 8 | Número del cheque |

### eCheq: `E-CHEQ XXXXXXXX`
Prefijo `E-CHEQ` + número de cheque.
