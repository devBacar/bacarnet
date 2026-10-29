# Relevamiento: Cheques Ocasionales (CHQOCA)

Fuente: conversación con Sergio (operador de Vientri), 29/10/2026, y análisis del dump completo `vientri_completo_20261028_1127`.

---

## 1. Qué son los cheques ocasionales

Son cheques de papel **emitidos por BACAR** a inversores/proveedores financieros. Se cargan en la tabla `CHQOCA` de Vientri. Algunos también aparecen en `CHQ` (la tabla contable principal); la unión se hace por `IDCHQ` directo o por serie+banco+importe.

## 2. Tablas involucradas

| Tabla | Filas | Uso |
|-------|------:|-----|
| `chqoca.csv` | 25,051 | Cheques ocasionales completos |
| `chq.csv` | 66,013 | Cheques regulares (recibidos + emitidos) |
| `prooca.csv` | 2,795 | Proveedores de ocasionales (ID → nombre + CUIT) |
| `cmp.csv` | 890,534 | Comprobantes (vincula cheques con facturas/recibos) |
| `per.csv` | 12,589 | Personas (razón social, CUIT, dirección) |
| `banco.csv` | ~500 | Bancos |

### Relación CHQOCA ↔ CHQ

- `CHQOCA.IDCHQ` (campo `id_cheque`) apunta al `vientri_id` de CHQ — link directo, más confiable.
- Fallback: match por serie (últimos 8 dígitos) + banco + importe. Si hay más de un candidato, queda marcado como ambiguo.
- Los que no matchean quedan como `fuentes: ['CHQOCA']`.

### Relación CHQOCA ↔ PROOCA

- `CHQOCA.IDPER_RECIBE` apunta a `PROOCA.ID` (no a `PER`).
- PROOCA tiene nombre formal (`DES`) y CUIT.
- El campo `DESTINATARIO` de CHQOCA es texto libre (ej. "MANA"), mientras que PROOCA tiene el nombre completo.

## 3. Mecánica de renovación

Confirmado por Sergio:

1. El cheque con OBS "Renovación" es el **nuevo** (el que se emite). Los viejos son los que vencían.
2. Cuando el OBS dice "Renovación cheques n° X/Y/Z", X/Y/Z son los cheques **viejos** que se renuevan.
3. Cuando dice solo "Renovación" sin números, Sergio no cargó los IDs. Se pueden inferir por **misma fecha de emisión + mismo beneficiario** → los que vencían ese día.

## 4. Dos modalidades de renovación

Depende del inversor:

### Modalidad 1: Mixto (capital + intereses juntos)

- Se calcula intereses al día de pago, se suma al capital, se distribuye en X cheques.
- OBS típica: "Cap + Int", "Capital + Intereses", "k + cap", "int+cap".

### Modalidad 2: Separado

- Cheques de capital por un lado, cheque de interés por otro.
- El de interés tiene OBS: **"Interes"**, **"Int"**, **"INTERESES Y CAP"**.
- Los de capital tienen OBS: **"Renovacion"**.
- El cheque de interés suele vencer **antes** que los de capital.

### Cómo distinguirlos en los datos

La OBS en CHQOCA **sí marca el rol**:
- `Interes` / `Int` → cheque de interés puro
- `Renovacion` (con o sin números) → cheque de capital
- `Cap + Int` / variantes → cheque mixto

**Ejemplo real (MANA, 16-oct-2026):**

| Cheque | OBS | Monto | Vto |
|--------|-----|------:|-----|
| 40074150 | Interes | $1,244,665 | 27-oct-2026 |
| 40074158 | Renovacion | $3,156,305 | 11-nov-2026 |
| 40074159 | Renovacion | $3,156,305 | 11-nov-2026 |
| 40074160 | Renovacion | $3,108,041 | 15-nov-2026 |
| 40074161 | Renovacion | $3,141,672 | 15-nov-2026 |
| 40074162 | Renovacion | $2,733,885 | 15-nov-2026 |
| 40074163 | Renovacion | $2,733,885 | 15-nov-2026 |

## 5. Fórmula de cálculo (planilla `sist.xlsx`)

Sergio usa una planilla Excel para calcular cada operación. Analizada la operación MANA del 09-set-2026 (U$70.000 TC $1.555):

### Parámetros

| Parámetro | Valor | Nota |
|-----------|-------|------|
| Tasa mensual | **6.5%** | Varía por operación |
| Tasa diaria | **0.2167%** | = tasa mensual / 30 |
| Impuesto (sellado) | **2.5%** | Sobre el importe bruto |
| Tipo de cambio | $1,555 | Para operaciones en USD |

### Fórmula por cheque

```
Días             = Fecha cobro - Fecha emisión
Tasa Equivalente = Importe bruto × Tasa diaria × Días     (interés simple)
Descuento        = Importe bruto × 2.5%                    (impuesto/sellado)
Importe neto     = Importe bruto - Tasa Equivalente - Descuento
```

### Cierre de la operación

La **suma de los importes netos** de todos los cheques debe igualar el monto adeudado al inversor:

```
Σ(Importe neto) = Dólares × TC
108,850,000     = 70,000 × 1,555   ✓
```

Los cheques tienen importes brutos **distintos** porque cada uno incluye sus propios intereses proporcionales al plazo hasta su vencimiento: cuanto más lejos vence, más interés acumula, más alto el bruto.

### Consecuencia para el cálculo de costo financiero

- La **tasa es mensual**, interés **simple**, calculada como diaria = mensual/30.
- El importe del cheque NO es capital puro: incluye intereses y sellado adentro.
- Para extraer el costo real de una cadena de renovación, hay que descontar el sellado (2.5%) y calcular el interés implícito sobre el neto.

## 6. Patrones de OBS conocidos

| Patrón | Qué indica | Regex existente |
|--------|-----------|-----------------|
| `Renovacion cheques n° X/Y/Z` | Nuevo cheque, renueva X/Y/Z | ✅ `parsearObs` |
| `Renovacion` (sola) | Nuevo cheque, sin IDs de viejos | ✅ `parsearObs` |
| `u$70.000 TC1555` | Operación USD con cotización | ✅ `parsearObs` |
| `$67.731.213 al 42.5%` | Monto total + tasa de la operación | ✅ `parsearObs` (nuevo) |
| `Interes` / `Int` | Cheque de interés puro | ⚠️ detectado por `esObsFinanciero`, no como rol |
| `Cap + Int` / variantes | Cheque mixto capital+interés | ⚠️ detectado parcialmente |
| `Interes 6% de capital $X` | Interés con tasa y capital explícitos | ❌ no parseado |

## 7. Datos nuevos del dump completo (vs CSV filtrado anterior)

| Campo | Antes (206 filas) | Ahora (25K filas) |
|-------|-------------------|-------------------|
| `IDCHQ` (id_cheque) | Disponible | Disponible — ahora se almacena como `vientriChqId` |
| `IDPER_RECIBE` | Disponible pero sin resolver | Ahora resuelto via PROOCA → `beneficiarioFormal` + `beneficiarioCuit` |
| `FEC_CONCILIADO` | No existía | Disponible — fecha de conciliación bancaria |
| `$X al Y%` en OBS | No aparecía (pocas filas) | 29 filas con tasa explícita |
| Historia completa | Solo pendientes | Cadenas de renovación históricas completas |

## 8. Pendientes de implementación

1. **Parseo de rol en OBS** — Exponer `'capital' | 'interes' | 'mixto'` como campo del doc, basado en las palabras clave de OBS.
2. **Parseo de "Interes X% de capital $Y"** — Extrae tasa y capital explícitos (patrón de Olmos).
3. **Heurística para renovaciones sin IDs** — Match por fecha emisión + beneficiario + fecha vencimiento cercana.
4. **Cálculo de costo financiero corregido** — Descontar sellado (2.5%) y usar interés simple diario (tasa mensual / 30 × días).
5. **Agrupación de operaciones** — Cheques con misma fecha emisión + mismo beneficiario + misma OBS = una operación.

## 9. Preguntas abiertas

- ¿El 2.5% de impuesto/sellado es fijo para todas las operaciones o varía?
- ¿La distribución de cheques la decide el inversor o hay un criterio estándar?
- ¿Hay operaciones donde la tasa no sea mensual?
