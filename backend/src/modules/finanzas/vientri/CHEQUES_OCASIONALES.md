# Cheques Ocasionales (CHQOCA)

Módulo para trackear el circuito financiero informal que opera a través de la tabla CHQOCA de Vientri (FoxPro). Los beneficiarios aparecen como proveedores, pero en realidad son operaciones de préstamo y cambio de dólares con interés compuesto.

## Qué es el circuito

BACAR recibe cheques de terceros (clientes, proveedores) y los entrega a "proveedores financieros" — personas que prestan plata o cambian dólares. El cheque original se renueva periódicamente por uno nuevo de mayor monto; la diferencia es el interés acumulado. Este circuito no pasa por el sistema bancario normal y se registra en Vientri en la tabla CHQOCA, separada de la tabla CHQ de cheques regulares.

### Ejemplo concreto

1. BACAR entrega un cheque de $5.000.000 a "Presta Plata" (proveedor financiero)
2. Al vencimiento, se renueva por un cheque de $5.800.000 → interés = $800.000
3. El nuevo se renueva por $6.700.000 → interés adicional = $900.000
4. Interés total pagado: $1.700.000 sobre un capital de $5.000.000 (tasa 34%)

### Operaciones USD

Algunos cheques son pago de operaciones en dólares. En el campo OBS aparece el monto USD y la cotización:
- `u$70.000 TC1565` → USD 70.000 a cotización $1.565

## Fuente de datos

### Tabla CHQOCA de Vientri

Exportada como CSV con separador `;` y encoding UTF-8. Columnas relevantes:

| Columna | Descripción |
|---|---|
| `vientri_id` | ID único en Vientri |
| `numero` | Número corto del cheque (ej: `44001234`) |
| `numero_completo` | Formato banco (ej: `020-111-2222-44001234`) |
| `id_banco` | Código de banco |
| `importe` | Monto con decimales (ej: `5000000.00`) |
| `pagado` | `0`/`1` |
| `fecha_vto` | Fecha de vencimiento |
| `fecha_emision` | Fecha de emisión |
| `id_estado` | Código numérico de estado |
| `baja` | `0`/`1` |
| `destinatario` | Nombre del beneficiario (proveedor financiero o real) |
| `obs` | Observaciones — contiene datos de renovación y operaciones USD |
| `fecha_conciliado` | Si tiene valor, el cheque fue pagado |
| `id_persona_recibe` | Referencia a persona en Vientri |

### Estados de cheque (id_estado)

| Código | Nombre | En Bacarnet |
|---|---|---|
| 0 | En cartera | `en_cartera` |
| 1 | Depositado | `depositado` |
| 2 | Vendido | `vendido` |
| 3 | Rechazado | `rechazado` |
| 4 | Entregado | `entregado` |
| 5 | **Renovado** | `renovado` |
| 6 | Pendiente débito | `pendiente_debito` |
| 7 | Debitado | `debitado` |
| 9 | Anulado | `anulado` |

**Estado 5 (Renovado)** es clave: marca que el cheque fue reemplazado por otro(s) de mayor monto. Antes se descartaban como duplicados; ahora se conservan para armar cadenas de renovación.

### Campo OBS — patrones reconocidos

El parseo está en `parsear-obs.ts`. Dos regex principales:

**Renovación:**
```
/renovaci[oó]n\s+cheques?\s*(?:n[°ºo]?\s*)?([\d\s,y/]+)/i
```
Variantes reales encontradas:
- `Renovacion cheque n° 38842801`
- `Renovacion cheques n° 38842801, 38842800 y 38842799`
- `Renovación cheques nº 11111, 22222`
- `Renovacion cheques 44001234/35/36` (números abreviados con barra)
- `Renovacion` (sola, sin números — se marca como renovación pero sin IDs)

**Operación USD:**
```
/u\$?\s*s?d?\s*([\d.]+)\s*tc\s*\$?\s*([\d.]+)/i
```
Variantes reales:
- `u$70.000 TC1565`
- `U$70.000 TC $1555`
- `usd 70.000 TC1540`
- `U$ 65000 TC1470`
- `u$20.000 TC $1.560`

Los puntos en montos son separador de miles (se quitan), no decimales.

## Proveedores financieros

La colección `proveedoresFinancieros` en Firestore tiene nombres marcados como `'financiero'` o `'ficticio'`. Al importar, cada cheque se cruza contra esa lista usando `normalizarNombre()` (NFD, lowercase, colapsa espacios).

Un cheque de un proveedor financiero **no es un gasto real** de la empresa — es una operación de préstamo. La clasificación permite separar:
- `gasto_real` — proveedor normal, compra genuina
- `operacion_financiera` — proveedor financiero o cheque en cadena de renovación

## Arquitectura del código

### Domain (funciones puras, sin Firestore)

```
backend/src/modules/finanzas/vientri/domain/
├── cheque-ocasional.types.ts   — Tipos: ChequeOcasionalDoc, CadenaRenovacion, etc.
├── parsear-obs.ts              — parsearObs(): extrae renovaciones y USD del campo OBS
├── parsear-obs.test.ts         — 14+ tests
├── cadena-renovacion.ts        — reconstruirCadenas(), clasificarCheques(), resumirCostoFinanciero()
└── cadena-renovacion.test.ts   — 9+ tests
```

### Service (Firestore, importación)

```
backend/src/modules/finanzas/vientri/services/
├── importar-cheques-ocasionales.ts       — importarChequesOcasionales({csv, origen, actor, simular})
└── importar-cheques-ocasionales.test.ts  — 3 tests
```

### Rutas

```
backend/src/modules/finanzas/vientri/routes/
└── cheques-ocasionales.routes.ts  — GET /, GET /cadenas, GET /resumen
```

Montado en `/api/finanzas/cheques-ocasionales`.

### Script CLI

```
backend/scripts/vientri-cheques-ocasionales-importar.mjs
```

## Colección Firestore

**`vientriChequesOcasionales`** — ID = `vientriId` (string del entero).

Cada documento es un `ChequeOcasionalDoc`:

```typescript
{
  numeroCheque: string           // numero_completo o numero
  beneficiario: string           // nombre original
  beneficiarioNormalizado: string // NFD lowercase
  montoCentavos: number          // entero en centavos
  fechaVencimiento: string|null  // 'YYYY-MM-DD'
  fechaEmision: string|null
  estadoCodigo: number|null
  estado: string                 // nombre legible
  pagado: boolean
  esProveedorFinanciero: boolean
  tipoProveedor: 'financiero'|'ficticio'|null
  esRenovacion: boolean          // true si el OBS menciona renovación
  renovacionDe: string[]         // números de cheques que este renueva
  renovadoPor: string[]          // números de cheques que renovaron a este (link inverso)
  operacionUsd: { montoUsd: number, cotizacion: number } | null
  obsOriginal: string
  revisar: string[]              // flags de datos sospechosos
  vientriId: number
  baja: boolean
}
```

## Cadenas de renovación

`reconstruirCadenas()` arma cadenas lineales a partir de los links `renovacionDe`/`renovadoPor`:

1. Busca la **raíz**: el cheque más viejo que no es renovación de otro
2. Camina hacia adelante por `renovadoPor` (si hay varios, elige el de mayor monto)
3. Calcula el **interés por eslabón** (diferencia de montos consecutivos)
4. Calcula el **interés total** = monto final − capital inicial
5. Calcula la **tasa implícita** = interés total / capital inicial

La búsqueda indexa tanto por número completo (`020-111-2222-44001234`) como por número corto (`44001234`), porque el campo OBS solo tiene el número corto.

### Clasificación

`clasificarCheques()` asigna a cada cheque:
- **`gasto_real`** — proveedor normal sin renovaciones
- **`operacion_financiera`** — con rol:
  - `capital` — primera posición en la cadena (el préstamo original)
  - `mixto` — posición intermedia (fue capital y se renovó)
  - `interes` — última posición (el monto vigente con todo el interés acumulado)

### Resumen por beneficiario

`resumirCostoFinanciero()` agrupa cadenas por beneficiario normalizado y totaliza:
- Cantidad de cadenas
- Capital total prestado
- Interés total pagado
- Tasa implícita promedio
- Desglose por beneficiario (ordenado por interés descendente)

## Endpoints API

### `GET /api/finanzas/cheques-ocasionales/`

Lista paginada de cheques ocasionales.

Query params:
- `filtro`: `''` | `'financiero'` | `'gasto_real'` | `'con_renovacion'` | `'con_usd'`
- `q`: búsqueda libre (beneficiario, número, OBS, estado)
- `page`: número de página (default 1)

Response:
```json
{
  "cheques": [ChequeOcasionalDoc...],
  "total": 150,
  "totalCentavos": 1500000000,
  "page": 1,
  "pages": 3
}
```

### `GET /api/finanzas/cheques-ocasionales/cadenas`

Cadenas de renovación con clasificación.

Response:
```json
{
  "cadenas": [CadenaRenovacion...],
  "clasificados": [ChequeClasificado...]
}
```

### `GET /api/finanzas/cheques-ocasionales/resumen`

Resumen ejecutivo con costo financiero.

Response:
```json
{
  "totalCheques": 150,
  "financieros": 80,
  "conRenovacion": 45,
  "conUsd": 20,
  "costoFinanciero": {
    "cantidadCadenas": 15,
    "capitalTotalCentavos": 50000000000,
    "interesTotalCentavos": 12000000000,
    "tasaImplicitaPromedio": 0.24,
    "porBeneficiario": [...]
  }
}
```

## Cómo importar datos

### Contra el emulador (desarrollo)

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='bacar-web'
node backend/scripts/vientri-cheques-ocasionales-importar.mjs --archivo "C:\ruta\CHQOCA.csv"
```

### Simulación (no escribe nada)

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:GCLOUD_PROJECT='bacar-web'
node backend/scripts/vientri-cheques-ocasionales-importar.mjs --archivo "C:\ruta\CHQOCA.csv" --simular
```

### Contra producción (pedir OK antes)

```powershell
node backend/scripts/vientri-cheques-ocasionales-importar.mjs --archivo "C:\ruta\CHQOCA.csv" --prod
```

El script detecta automáticamente si el CSV tiene header o no (busca las columnas requeridas en la primera línea).

## Qué falta

- [ ] **Pantallas frontend** — lista de cheques ocasionales, vista de cadenas, resumen de costo financiero
- [ ] **Sync con Agenda** — que los cheques ocasionales de proveedores financieros aparezcan como origen `'ocasionales'` en la agenda
- [ ] **Importación automática** — cuando se integre la copia Vientri completa (hoy es manual por CSV)
- [ ] **Cruce con cheques regulares** — vincular un CHQOCA con su cheque CHQ regular cuando exista en ambas tablas

## Relación con otros módulos

- **`cheques/`** — La tabla CHQ regular ya tiene estado `renovado` y el campo `ocasionalEnriquecido` para cheques que se cruzaron con CHQOCA
- **`agenda/`** — Los proveedores financieros están en `proveedoresFinancieros` (colección compartida)
- **`vientri/`** — Comparte `sincronizarColeccion`, `crearImportacion`, `cerrarImportacion` del repository
- **`hoy/`** — El tipo `ChequesRenovadosHoy` existe en `hoy.tipos.ts` para mostrar renovaciones en el dashboard

## Tests

```powershell
# Solo ocasionales
npx vitest run backend/src/modules/finanzas/vientri/domain/parsear-obs.test.ts
npx vitest run backend/src/modules/finanzas/vientri/domain/cadena-renovacion.test.ts
npx vitest run backend/src/modules/finanzas/vientri/services/importar-cheques-ocasionales.test.ts

# Suite completo de finanzas
npm run test:finanzas
```
