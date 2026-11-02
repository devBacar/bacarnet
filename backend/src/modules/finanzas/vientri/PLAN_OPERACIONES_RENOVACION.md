# Plan: Mejora de agrupación de operaciones de renovación

## Contexto

El modelo de operaciones (`operacion-renovacion.ts`) agrupa cheques de renovación por beneficiario + fechaEmision + banco. Hoy tiene dos mecanismos de linking:

1. **Explícito**: el OBS del cheque nuevo lista los IDs de los viejos → linking directo
2. **Implícito (heurístico)**: busca viejos del mismo beneficiario con vencimiento cercano

El problema del linking implícito actual es que usa `fechaVencimiento` como proxy, lo cual es impreciso. El análisis de datos reales (25K cheques CHQOCA) reveló que `FEC_CONCILIADO` es un campo mucho más confiable.

## Hallazgos del análisis de datos

### Dataset: cheques con OBS "Renovación" emitidos oct/2025–oct/2026 (870 cheques)

| Grupo | Cantidad | % | Método de linking |
|-------|----------|---|-------------------|
| Con IDs explícitos en OBS | 681 | 78.3% | Link directo por número de cheque |
| Sin IDs, con match FEC_CONCILIADO | 158 | 18.2% | FEC_CONCILIADO viejo ≈ FECEMISION nuevo |
| Sin match en ningún lado | 31 | 3.6% | Pendiente: bancos equivalentes, cruce con CHQ |

### Validación de FEC_CONCILIADO (sobre 681 cheques con IDs explícitos)

Se cruzaron los cheques donde **sabemos** cuál es el viejo (por IDs en OBS) para verificar si FEC_CONCILIADO del viejo coincide con FECEMISION del nuevo:

| Fecha | Match | % |
|-------|-------|---|
| FEC_CONCILIADO exacto | 91.5% | ← **mejor** |
| FECSYS exacto | 86.6% | |
| FEC_CONCILIADO ±1 día | ~95% | |
| FEC_CONCILIADO ±2 días | ~96% | |

**Interpretación**: cuando Vientri marca un cheque como renovado, le pone FEC_CONCILIADO = fecha de la operación de renovación, que es la misma FECEMISION de los cheques nuevos.

### Casos sin match (31 cheques)

| Beneficiario | Cheques | Causa raíz | Solución propuesta |
|---|---|---|---|
| MAHUM DIEGO | 8 | Cheques viejos no están en CHQOCA (probablemente en CHQ regular) | Cruce con tabla CHQ (fase posterior) |
| P OLMOS | 1 | OBS truncado, no se puede leer ID | Revisión manual o marcar como `revisar` |
| POVO | ~22 | Nuevos en banco 5010, viejos en banco 5000 (mismo circuito) | Tabla de bancos equivalentes |

---

## Plan de implementación

### Fase 1: Guardar `fechaConciliado` en el doc ✅

**Estado:** Completada.

- `cheque-ocasional.types.ts` — `fechaConciliado: string | null` agregado a `ChequeOcasionalDoc`
- `importar-cheques-ocasionales.ts` — mapea `fecha_conciliado` del CSV; `pagado` también se deriva de él
- `importar-cheques-ocasionales.test.ts` — test "guarda fechaConciliado cuando está presente"

### Fase 2: Mejorar auto-linking en `operacion-renovacion.ts` ✅

**Estado:** Completada.

- `operacion-renovacion.ts` — `buscarOperacionOrigen()` agrupa cheques viejos por OBS+beneficiario+fechaEmisión (operaciones coherentes), luego intenta fechaConciliado primero (±2 días), fallback a fechaVencimiento, con sanity check ≤50% interés
- `operacion-renovacion.test.ts` — 5 tests nuevos: auto-link por fechaConciliado, prioridad sobre fechaVencimiento, tolerancia ±1 día, cross-bank POVO, rechazo de bancos no equivalentes

### Fase 3: Bancos equivalentes ✅

**Estado:** Completada.

- `operacion-renovacion.ts` — `BANCOS_EQUIVALENTES` (`020-923-5000` ↔ `020-923-5010`), `bancosCompatibles()`, `extraerBanco()` ahora usa 3 partes del número de cheque
- `operacion-renovacion.test.ts` — test cross-bank POVO y rechazo de bancos no equivalentes

### Fase 4: Resumen en endpoint + contrato API ✅

**Estado:** Completada.

- `cheques-ocasionales.routes.ts` — endpoint `/operaciones-renovacion` devuelve `resumen: { vinculadas, explicitas, implicitas, sinMatch }`
- `finanzasChequesApi.ts` — `ResumenOperacionesRenovacion` interface + campo `resumen?` en response

### Fase 5: Cruce con CHQ ✅

**Estado:** Completada.

- `cheques-ocasionales.routes.ts` — `inyectarChqParaAutolink()` lee cheques CHQ regulares pagados/renovados con `esProveedorFinanciero`, los convierte a sintéticos `ChequeOcasionalDoc` y los inyecta al pool antes de agrupar
- `operacion-renovacion.test.ts` — test "auto-vincula cheque viejo de CHQ regular (sintético) por fechaConciliado"
- Caso principal resuelto: MAHUM DIEGO cuyos viejos están en CHQ, no en CHQOCA

---

## Orden recomendado

```
Fase 1 (fechaConciliado) → Fase 2 (auto-linking) → Fase 3 (bancos equiv.) → Fase 4 (pantalla)
```

Fases 1–7 completadas.

### Fase 6: Robustez del auto-linking ✅

**Estado:** Completada.

Tres mejoras al algoritmo de `buscarOperacionOrigen()`:

1. **Cadenas A→B→C** — eliminada la restricción `if (d.esRenovacion) continue` al construir el pool de cheques viejos. Un cheque que es renovación pagada ahora puede ser origen de otra renovación. Caso real: HNA CLAUDIA / HERMANA CLAUDIA

2. **Refinamiento por vencimiento** — cuando el set de candidatos da tasa negativa o >50% (porque incluye un cheque "intruso" pagado tarde con conciliado cercano pero vto lejano), se filtra a candidatos con `fechaVencimiento ±5 días` de la emisión del nuevo. Caso real: MANA cheque 39316609 (vto=14/10, pagado tarde 22/10) contaminaba el grupo de 7 cheques con vto=23/10

3. **Fallback cross-operación** — cuando ninguna operación origen individual tiene suficientes candidatos, se juntan candidatos de TODAS las operaciones origen del mismo beneficiario. Caso real: MANA con 6 cheques viejos de dos lotes distintos (em=08-25 + em=09-10) que se renuevan juntos el 16/10

Tests agregados: cadena A→B→C, intruso con vto lejano, cross-operación

### Fase 7: Frontend operaciones ✅

**Estado:** Completada.

- `OperacionesRenovacion.tsx` — componente con agrupación por beneficiario compatible, distinción actual/anterior (vto futuro = actual resaltada, históricas colapsables), búsqueda, filtros por vto
- `PestanaOcasionales.tsx` — pestaña contenedora integrada
- `finanzasChequesApi.ts` — contrato API: `OperacionRenovacionItem`, `ChequeEnOperacionItem`, `fetchOperacionesRenovacion()`
- `beneficiariosCompatibles()` replicada en frontend para agrupar nombres compatibles (HNA CLAUDIA + HERMANA CLAUDIA)

---

## Cobertura esperada por fase

| Fase | Cheques vinculados | % del total (870) |
|------|-------------------|-------------------|
| Actual (solo IDs explícitos) | 681 | 78.3% |
| + Fase 2 (FEC_CONCILIADO) | 839 | 96.4% |
| + Fase 3 (bancos equivalentes) | ~861 | ~99.0% |
| + Fase 5 (cruce CHQ) | ~869 | ~99.9% |
| + Fase 6 (robustez) | ~870 | ~100% | ← **actual**
