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
| `fecha_conciliado` | Fecha de conciliación bancaria (cuándo el banco procesó el pago). En renovaciones, coincide con `fecha_emision` del cheque nuevo el 91.5% de los casos (ver análisis en PLAN_OPERACIONES_RENOVACION.md) |
| `fecimp` | Timestamp de impresión/creación del cheque en Vientri |
| `fecsys` | Timestamp de última modificación del registro en Vientri. En cheques renovados, se actualiza al momento de la renovación |
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

Todos los cheques ocasionales son del circuito financiero (préstamo, divisa, renovación). No existe la categoría "gasto real" en este módulo: eso pertenece a los cheques emitidos comunes. Los ocasionales con datos dudosos quedan marcados en `revisar` y se ven con el filtro "A revisar".

## Arquitectura del código

### Domain (funciones puras, sin Firestore)

```
backend/src/modules/finanzas/vientri/domain/
├── cheque-ocasional.types.ts   — Tipos: ChequeOcasionalDoc, CadenaRenovacion, etc.
├── parsear-obs.ts              — parsearObs(): extrae renovaciones y USD del campo OBS
├── parsear-obs.test.ts         — 14+ tests
├── operacion-renovacion.ts     — agruparOperacionesRenovacion(): modelo por operación (PRIMARIO)
├── operacion-renovacion.test.ts— tests del modelo por operación
├── seguimiento.types.ts        — EstadoChequeRenov, ChequeConEstado, OperacionPersistida, respuesta del seguimiento
├── seguimiento.ts              — construirSeguimiento(), derivarSeguimiento(), estadoOperacion(), armarSeguimiento()
├── seguimiento.test.ts         — tests del seguimiento
├── cadena-renovacion.ts        — reconstruirCadenas() (DEPRECADO, reemplazado por operación)
└── cadena-renovacion.test.ts   — 9+ tests
```

### Service (Firestore, importación)

```
backend/src/modules/finanzas/vientri/services/
├── importar-cheques-ocasionales.ts       — importarChequesOcasionales({csv, origen, actor, simular})
├── importar-cheques-ocasionales.test.ts  — 3 tests
├── completar-eslabones-vientri.ts        — leerActivosConEslabonesDeVientri(): completa viejos desde cheques / ientriCheques`n├── inyectar-chq-autolink.ts              — inyectarChqParaAutolink(): inyecta CHQ regulares como sintéticos
├── recalcular-seguimiento.ts             — recalcularSeguimiento(): persiste el seguimiento (upsert)
└── recalcular-seguimiento.test.ts        — tests del recálculo
```

### Rutas

```
backend/src/modules/finanzas/vientri/routes/
└── cheques-ocasionales.routes.ts  — GET /, GET /cadenas, GET /resumen, GET /operaciones-renovacion, GET /seguimiento
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

## Operaciones de renovación (modelo primario)

Las renovaciones en la práctica ocurren en **bloque**: mismo beneficiario, misma fecha, múltiples cheques. Por eso el modelo correcto es **por operación** (N viejos → M nuevos), no por cadena individual (A→B→C).

`agruparOperacionesRenovacion()` agrupa cheques por `claveGrupo` = beneficiarioNormalizado + fechaEmision + banco:

1. **Linking explícito**: si el OBS del cheque nuevo lista IDs (`renovacionDe`), se buscan los viejos por número
2. **Auto-linking implícito**: si no hay IDs, se buscan viejos del mismo beneficiario con `fechaConciliado` = `fechaEmision` del nuevo (±2 días), mismo banco o banco equivalente, y sanity check de interés ≤50%

### Mecanismos de auto-linking

El auto-linking tiene varias capas que se aplican en orden:

1. **Por operación origen**: agrupa cheques viejos pagados por `obsOriginal|beneficiarioNormalizado|fechaEmision`. Busca dentro de cada grupo por `fechaConciliado ±2 días` (prioridad) o `fechaVencimiento ±2 días` (fallback)

2. **Refinamiento por vencimiento**: si el set de candidatos da tasa negativa o >50% (por un cheque "intruso" pagado tarde con conciliado cercano pero vto lejano), filtra a candidatos con `fechaVencimiento ±5 días` de la emisión del nuevo

3. **Fallback cross-operación**: cuando ninguna operación origen individual tiene suficientes candidatos, junta candidatos de TODAS las operaciones origen del mismo beneficiario. Caso real: MANA con cheques de dos lotes distintos (em=08-25 obs A + em=09-10 obs B) que se renuevan juntos en un solo bloque nuevo

4. **Cadenas A→B→C**: un cheque que es renovación (`esRenovacion: true`) Y está pagado (`pagado: true`) puede servir como origen para otra renovación. Permite cadenas de renovación encadenadas

5. **Bancos equivalentes**: `020-923-5000` ↔ `020-923-5010` son el mismo circuito. `bancosCompatibles()` permite cross-bank matching

6. **Beneficiarios compatibles**: `beneficiariosCompatibles()` matchea nombres que comparten al menos una palabra ≥3 caracteres por prefijo. Ej: "HNA CLAUDIA" ↔ "HERMANA CLAUDIA" matchean por "CLAUDIA"

### Sanity check

El interés implícito debe ser ≥0% y ≤50%. Esto evita falsos positivos (vincular cheques que no son realmente una renovación).

Cada `OperacionRenovacion` tiene:
- `chequesNuevos[]` — los cheques emitidos en la renovación
- `chequesViejos[]` — los cheques que se renovaron
- `totalViejosCentavos` / `totalNuevosCentavos` — totales en centavos
- `interesCentavos` — diferencia (monto nuevo − monto viejo)
- `tasaImplicita` — interés / monto viejo
- `vinculada` — true si se encontraron cheques viejos
- `tipoVinculo` — `'explicito'` (IDs en OBS) o `'implicito'` (auto-link)

### Análisis de cobertura (datos reales, último año oct/2025–oct/2026)

Sobre 870 cheques con OBS de renovación:

| Método de linking | Cheques | % del total |
|---|---|---|
| IDs explícitos en OBS | 681 | 78.3% |
| Auto-link (FEC_CONCILIADO + beneficiario) | 158 | 18.2% |
| Sin match | 31 | 3.6% |

**FEC_CONCILIADO vs FECSYS para auto-linking** (validado con IDs explícitos):
- FEC_CONCILIADO del viejo = FECEMISION del nuevo: **91.5%** exacto
- FECSYS del viejo = FECEMISION del nuevo: **86.6%** exacto
- Conclusión: FEC_CONCILIADO es mejor campo para linking

### Casos resueltos (antes sin match)

| Beneficiario | Cheques | Causa original | Solución |
|---|---|---|---|
| MAHUM DIEGO | 8 | Viejos en CHQ regular, no en CHQOCA | Fase 5: inyección de CHQ sintéticos |
| POVO | ~22 | Cross-bank: nuevos 5010, viejos 5000 | Fase 3: `BANCOS_EQUIVALENTES` |
| HNA CLAUDIA / HERMANA CLAUDIA | varios | Nombre escrito distinto | `beneficiariosCompatibles()` |
| MANA (25M) | 11 | Cheque intruso con conc cercano pero vto lejano | Refinamiento por vto ±5 días |
| MANA (18M) | 6 | Viejos de 2 lotes distintos (obs A y B) | Fallback cross-operación |

### Caso pendiente

| Beneficiario | Cheques | Causa |
|---|---|---|
| P OLMOS | 1 | OBS truncado, no se puede leer el ID completo |

## Seguimiento de renovaciones

Responde "¿qué posiciones siguen abiertas con cada beneficiario y de dónde vienen?". Se calcula sobre las operaciones de `agruparOperacionesRenovacion()` y se **persiste** para no recalcular todo en cada lectura.

### Estado de cada cheque nuevo

Se evalúa en este orden (gana el primero que se cumple):

| Orden | Condición | Estado |
|---|---|---|
| 1 | `baja` | se excluye de la operación y de la cadena |
| 2 | figura como viejo en otra operación, o `estadoCodigo` 5 | `renovado` |
| 3 | `estadoCodigo` 9 | `anulado` |
| 4 | `estadoCodigo` 3 | `rechazado` |
| 5 | `pagado` | `debitado` |
| 6 | ninguna de las anteriores | `pendiente` |

- **Exposición** = `pendiente` + `rechazado` (el rechazado se resalta en rojo). `debitado`, `anulado` y `renovado` no suman.
- **Operación cerrada** = todos sus nuevos son `debitado`, `anulado` o `renovado` **y** el máximo `fechaVencimiento` de sus nuevos es anterior a hoy. Si no, está **abierta**. Se calcula al leer con la fecha de hoy (`estadoOperacion(op, hoy)`), no se guarda.
- **Cadena**: cada operación guarda `operacionesAnterioresIds[]` (operaciones cuyos nuevos aparecen como viejos en esta). Una lista y no un único id porque el fallback cross-operación puede juntar viejos de varias operaciones.

### Persistencia

Colección **`renovacionesChequesAgrupados`** (derivada, se regenera desde `vientriChequesOcasionales`).

- ID determinístico: `renov-{beneficiarioNormalizado}-{fechaEmision}-{banco}`. Si dos operaciones comparten base (subgrupos de un mismo grupo) la segunda y siguientes llevan sufijo `-2`, `-3`… Los eCheq no tienen banco: el tramo queda como `?`.
- Se recalcula al final de `importarChequesOcasionales` (no en modo `simular`) con `recalcularSeguimiento()`: upsert por huella con `sincronizarColeccion`.
- Por defecto **no borra** las operaciones que dejaron de existir (`borrarFaltantes: false`).
- Si el recálculo falla, la importación no se cae: el error queda en `seguimientoError` del resultado, en el `mensaje` y en el log.
- Cada documento es una `OperacionPersistida`: la `OperacionRenovacion` + `chequesNuevos[].estado` / `operacionSiguienteId`, `operacionesAnterioresIds`, `fechaVtoMax` y `exposicionCentavos`.

### Endpoint

`GET /api/finanzas/cheques-ocasionales/seguimiento?estado=abiertas|todas` (default `abiertas`). Lee la colección persistida.

```json
{
  "hoy": "YYYY-MM-DD",
  "estado": "abiertas",
  "beneficiarios": [BeneficiarioSeguimiento...],
  "ancestros": [OperacionSeguimientoItem...],
  "totales": { "beneficiarios": 0, "operaciones": 0, "posicionesAbiertas": 0, "exposicionCentavos": 0 }
}
```

- Agrupa por beneficiario con `beneficiariosCompatibles()` (ordenado por exposición descendente).
- Cada operación trae `estadoOperacion` y `ancestrosIds` (transitivos, del más cercano al más lejano).
- `ancestros` incluye las operaciones referenciadas por `ancestrosIds` que no están ya en `beneficiarios`, para poder navegar hacia atrás.

### Frontend

`SeguimientoRenovaciones.tsx` (solapa "Seguimiento" en `PestanaOcasionales`): beneficiarios con posiciones abiertas y exposición; al expandir, lista de cheques pendientes/rechazados con vto y monto; "Ver cadena" abre el drill-down con la tabla viejo→nuevo, los estados y los links "viene de" / "se renueva →".
## Cadenas de renovación (deprecado)

> **NOTA**: El modelo de cadenas lineales está deprecado en favor del modelo por operación. Se conserva para referencia y migración gradual.

`reconstruirCadenas()` arma cadenas lineales a partir de los links `renovacionDe`/`renovadoPor`:

1. Busca la **raíz**: el cheque más viejo que no es renovación de otro
2. Camina hacia adelante por `renovadoPor` (si hay varios, elige el de mayor monto)
3. Calcula el **interés por eslabón** (diferencia de montos consecutivos)
4. Calcula el **interés total** = monto final − capital inicial
5. Calcula la **tasa implícita** = interés total / capital inicial

La búsqueda indexa tanto por número completo (`020-111-2222-44001234`) como por número corto (`44001234`), porque el campo OBS solo tiene el número corto.

### Clasificación

`clasificarCheques()` asigna a cada cheque que está en una cadena su rol (los demás quedan con `rolEnCadena: null`):
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
- `filtro`: `''` | `'revisar'` | `'con_renovacion'` | `'con_usd'`
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

### `GET /api/finanzas/cheques-ocasionales/operaciones-renovacion`

Operaciones de renovación agrupadas con auto-linking.

Response:
```json
{
  "operaciones": [OperacionRenovacionItem...],
  "resumen": {
    "vinculadas": 45,
    "explicitas": 35,
    "implicitas": 10,
    "sinMatch": 5
  }
}
```

Cada `OperacionRenovacionItem` tiene `chequesNuevos[]`, `chequesViejos[]`, totales, interés, tasa, tipo de vínculo.

### `GET /api/finanzas/cheques-ocasionales/seguimiento`

Seguimiento de posiciones abiertas por beneficiario (ver sección *Seguimiento de renovaciones*).

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

- [x] ~~Guardar `fechaConciliado` en `ChequeOcasionalDoc`~~ — completado
- [x] ~~Mejorar auto-linking en operaciones~~ — completado (fechaConciliado, refinamiento vto, cross-operación, cadenas)
- [x] ~~Bancos equivalentes~~ — completado (020-923-5000 ↔ 5010)
- [x] ~~Cruce con cheques regulares~~ — completado (inyección de CHQ sintéticos para MAHUM DIEGO)
- [x] ~~Pantalla de operaciones~~ — completado (OperacionesRenovacion.tsx con actual/anterior)
- [ ] **Sync con Agenda** — que los cheques ocasionales de proveedores financieros aparezcan como origen `'ocasionales'` en la agenda
- [ ] **Importación automática** — cuando se integre la copia Vientri completa (hoy es manual por CSV)
- [ ] **Pantalla de resumen ejecutivo** — dashboard con costo financiero total por beneficiario

## Relación con otros módulos

- **`cheques/`** — La tabla CHQ regular ya tiene estado `renovado` y el campo `ocasionalEnriquecido` para cheques que se cruzaron con CHQOCA
- **`agenda/`** — Los proveedores financieros están en `proveedoresFinancieros` (colección compartida)
- **`vientri/`** — Comparte `sincronizarColeccion`, `crearImportacion`, `cerrarImportacion` del repository
- **`hoy/`** — El tipo `ChequesRenovadosHoy` existe en `hoy.tipos.ts` para mostrar renovaciones en el dashboard

## Frontend

### Componentes

```
src/components/finanzas/cheques/
├── PestanaOcasionales.tsx         — pestaña contenedora en la pantalla de cheques
├── OperacionesRenovacion.tsx      — vista de operaciones agrupadas por beneficiario
└── SeguimientoRenovaciones.tsx    — seguimiento de posiciones abiertas y drill-down de cadena
```

### OperacionesRenovacion.tsx

Pantalla principal de operaciones de renovación. Funcionalidades:

- **Agrupación por beneficiario**: agrupa operaciones usando `beneficiariosCompatibles()` (misma lógica que el backend). HNA CLAUDIA y HERMANA CLAUDIA aparecen juntas
- **Operación actual vs anterior**: dentro de cada grupo:
  - **Actual** = cheques nuevos con vencimiento ≥ hoy → resaltada con borde violeta, siempre visible
  - **Anterior** = todo lo demás → colapsadas detrás de botón "N operaciones anteriores"
- **Búsqueda**: por beneficiario, número de cheque o importe
- **Filtros**: rango de vencimiento (desde/hasta)
- **Filtro por beneficiario**: click desde otra pantalla filtra usando compatibilidad de nombres
- **Detalle expandible**: cada operación muestra tabla pareada viejo→nuevo con interés y días por par

### Contrato API

`src/services/finanzasChequesApi.ts` — tipos `OperacionRenovacionItem`, `ChequeEnOperacionItem`, `ResumenOperacionesRenovacion` y función `fetchOperacionesRenovacion()`

## Tests

```powershell
# Operaciones de renovación (19 tests)
npx vitest run backend/src/modules/finanzas/vientri/domain/operacion-renovacion.test.ts

# Seguimiento de renovaciones
npx vitest run backend/src/modules/finanzas/vientri/domain/seguimiento.test.ts
npx vitest run backend/src/modules/finanzas/vientri/services/recalcular-seguimiento.test.ts

# Parseo de OBS
npx vitest run backend/src/modules/finanzas/vientri/domain/parsear-obs.test.ts

# Cadenas (deprecado)
npx vitest run backend/src/modules/finanzas/vientri/domain/cadena-renovacion.test.ts

# Importación
npx vitest run backend/src/modules/finanzas/vientri/services/importar-cheques-ocasionales.test.ts

# Suite completo de finanzas
npm run test:finanzas
```
