# Módulo Cheques — contexto completo para una IA nueva

> Para quién es esto: un agente que **no conoce el negocio ni el código** y va a trabajar en el módulo de Cheques de Bacarnet.
> Leelo entero antes de tocar nada. Está escrito contra el código real (rama `feature/finanzas-cheques`, nov 2026).
> Este documento reemplaza al viejo `docs/modulo-cheques.md` (describía la época de los Excel y se eliminó). Si lo encontrás en el historial de git, no te guíes por él.
> Antes de este doc, leé `CLAUDE.md` y `REGLAS.md` en la raíz: mandan sobre todo lo demás.

---

## 0. Resumen en 60 segundos

- **Bacarnet** es la intranet de BACAR S.A. El módulo **Finanzas** tiene una pantalla "Chequera Virtual" (`/finanzas/cheques`).
- Un **cheque** acá es plata a cobrar (cheque **recibido**, de un cliente o tercero) o plata a pagar (cheque **emitido**, propio de BACAR).
- Los datos **ya no se cargan a mano**: vienen de **Vientri** (el ERP de la empresa, FoxPro/SQL Server) vía una copia diaria en CSV. Bacarnet **nunca escribe en Vientri**.
- Los cheques viven en la colección Firestore **`cheques`**. Se cruzan con los **movimientos bancarios** (Interbanking) para saber si el banco ya los debitó/acreditó ("conciliar").
- Hay un submódulo especial, **Cheques Ocasionales (CHQOCA)**: un circuito de financiación informal (préstamos y compra de dólares con cheques que se renuevan con interés). Es la parte más compleja y la más delicada.
- Toda la plata está en **centavos enteros**. Las fechas de negocio son `'YYYY-MM-DD'`.

---

## 1. Glosario de negocio

| Término | Qué es |
|---|---|
| **Vientri** | ERP de BACAR. Fuente de verdad de cheques, facturas, personas. Solo lectura desde Bacarnet. |
| **Chq** | Tabla de Vientri con TODOS los cheques regulares (recibidos y emitidos). |
| **CHQOCA** | Tabla de Vientri con cheques de papel emitidos, "cheques ocasionales". Algunos están también en Chq, otros solo acá. |
| **PROOCA** | Tabla de Vientri con proveedores de ocasionales (id → nombre y CUIT). |
| **Recibido** | Cheque a favor de BACAR (entra plata). Origen: cliente o tercero. |
| **Emitido** | Cheque propio de BACAR (sale plata). Origen siempre `propio`. |
| **eCheq** | Cheque electrónico. **Físico** = de papel. |
| **Cartera** | Cheques recibidos que todavía se pueden usar (depositar, endosar, vender). |
| **Endosar** | Usar un cheque recibido para pagarle a un proveedor (se lo "pasás"). En Bacarnet queda `utilizado: true` y se anota el destinatario. |
| **Diferido / vencimiento (`fechaPago`)** | Fecha desde la que el cheque se puede cobrar. |
| **Debitado / acreditado** | El banco ya movió la plata. Emitido → se **debita**; recibido → se **acredita**. |
| **Conciliar / vincular** | Asociar un cheque con la línea del extracto bancario (`movimientosBancarios`) donde impactó. |
| **Renovar** | Un cheque que no se puede pagar a tiempo se **reemplaza** por uno nuevo de mayor monto; la diferencia es interés. El viejo queda en estado `renovado`. |
| **Proveedor financiero** | Persona/empresa que presta plata o cambia dólares y cobra con cheques. En Agenda están en la colección `proveedoresFinancieros`. Un cheque suyo **no es un gasto real**, es una operación financiera. |
| **Interés encubierto** | Cheque cuyo beneficiario real es un proveedor financiero (aunque en Vientri figure como "proveedor" común). |
| **Operación de renovación** | Bloque N cheques viejos → M cheques nuevos, mismo beneficiario y misma fecha. Es el modelo principal (no la cadena A→B→C). |
| **Seguimiento / exposición** | Posiciones abiertas con cada beneficiario: cheques nuevos `pendiente` o `rechazado` que todavía hay que cubrir. |
| **Hoy** | Pantalla `/finanzas/hoy`: qué se paga y se cobra hoy y esta semana. Consume cheques. |
| **Agenda** | Módulo de compromisos de pago (`compromisosPago`). Los cheques emitidos pendientes se reflejan ahí. |
| **Interbanking / movimientos** | Extracto bancario sincronizado; colección `movimientosBancarios`. |

---

## 2. Reglas de oro (no negociables)

Sacadas de `CLAUDE.md`, `REGLAS.md` y de decisiones del usuario. Si dudás, preguntá.

1. **Plata = centavos enteros.** Nunca floats. `montoCentavos`.
2. **Fechas de negocio** `'YYYY-MM-DD'`; en Timestamps de Firestore se guardan al mediodía AR: `Timestamp.fromDate(new Date(`${ymd}T12:00:00-03:00`))`.
3. **No se borra nada**: baja lógica (`anulado`, `estado: 'inactivo'`). Excepción histórica: `desvincularChequesFueraDeVentana` borra campos de vínculo (con `dryRun`).
4. **Errores en palabras simples** al usuario: `res.status(400).json({ error: '...' })`. Los usuarios son gerentes de Finanzas: sin jerga.
5. **Contratos front↔back** en `src/services/finanzasChequesApi.ts`: si cambia un lado, cambia el otro.
6. **Archivos compartidos** (tocar con cuidado y listar en el PR): `backend/src/modules/finanzas/routes/index.ts`, `finanzasNavConfig.ts`, `src/routes/AppRoutes.tsx`, `src/pages/index.ts`, `firestore.rules`, `backend/src/modules/auth/middleware.ts`.
7. **Prohibido**: datos reales (el Excel de Finanzas), secretos o `.env` en el repo; **deploy, push o PR sin permiso explícito**; **commitear sin que el usuario lo pida** (tienen GitGuardian).
8. **Una tarea = un chat/agente nuevo.** Ramas `feature/*`, commits chicos, alcance atómico.
9. **Conciliación = plata real.** Ante ambigüedad **no se elige solo**: se deja sin vincular o se pide confirmación humana.
10. **`.env.bacar-web`**: nunca pisarlo entero; sin `FINANZAS_BANK_PROVIDER=interbanking` los saldos caen silenciosamente a mock.
11. **Centro de pagos unificado en Hoy**: se probó, el usuario lo rechazó. No recrearlo salvo pedido explícito.
12. **Formularios Finanzas**: `FinanzasFormField` + `finanzasInputClass`, etiqueta siempre visible; montos con `formatMoneyCentavos`.

Verificación antes de entregar: `npm run test:finanzas` · `npx tsc -b` · `npx tsc --noEmit -p backend` · `npm run build`.

---

## 3. Arquitectura de datos: de dónde sale cada cheque

```
VIENTRISRV (ERP real)
   └─ copia read-only SGA_BACAR en SQL Server LocalDB (PC SIS5)
        └─ scripts/vientri-export/exportar_vientri.ps1 + sql/*.sql  → CSVs (cheques.csv, cheques_propios.csv, personas, comprobantes…)
             └─ zip a una carpeta de Google Drive
                  └─ Bacarnet: traer-desde-drive.ts (tarea programada diaria + botón "Traer datos de Vientri ahora")
                       └─ importarVientri()  ──► colecciones vientri*  ──► sincronizarChequesDesdeVientri()  ──► colección `cheques`
```

Horarios del pipeline (según notas del equipo, no verificado en código): Vientri 02:00 → SIS5 05:00 → Bacarnet ~06:30/07:30/08:30.

### 3.1 Orden de `importarVientri` (`vientri/services/importar-vientri.ts`)
1. Lee CSVs → `procesarCarpeta`. Si hay `cheques_propios.csv` con columna `obs`, arma ocasionales y **`marcarRenovadosPorCadena`** marca como `renovado` los cheques pendientes que fueron superados.
2. Aplica **ventana** (`domain/ventana.ts`): solo cheques que vencen desde hace **12 meses** (`MESES_VENTANA`). Los más viejos que siguen "abiertos" van a un listado de **limpieza** para que Administración los corrija en Vientri.
3. Guardas de seguridad: si una carga trae menos del **95 %** (`PROPORCION_MINIMA`) de los cheques que ya había, se frena (copia incompleta).
4. Sincroniza **Agenda** (`sincronizarAgenda`, `sincronizarAgendaCheques`) solo si la bandera `agendaVientriActivada()` está encendida.
5. Escribe estado/limpieza; luego **`sincronizarChequesDesdeVientri`** (vientriCheques → `cheques`) y **`importarChequesOcasionales`** (cheques_propios.csv → `vientriChequesOcasionales`). Si estos dos fallan, la importación igual queda como completada (error solo logueado).

### 3.2 Cómo se arma un cheque Vientri (`vientri/domain/cheques.ts`)
- Tabla `Chq` trae recibidos **y** emitidos. **Emitido vs recibido** lo decide `librador_es_bacar` (idper_emi = 1 o CUIT del librador = CUIT de BACAR), no la tabla.
- `CHQOCA` se **une** con `Chq` por `id_cheque`+mismo importe, o por serie (últimos 8 dígitos)+banco+importe. Si hay más de un candidato: **no se adivina**, queda separado y se cuenta como `ambiguos`.
- Cheques solo-CHQOCA quedan como `clave: oca-<id>`; los de Chq como `chq-<id>`.
- Una baja en Chq con otro cheque vivo de la misma serie+banco se descarta (se volvió a cargar).
- Estados de Chq (`estadoDesdeChq`): 1 En cartera · 2 Depositado · 4 Pago a proveedor (emitido→`pendiente_debito`, recibido→`entregado`) · 5 Renovado · 8 Vendido · 10 Pago confirmado a proveedor (emitido→`debitado`, recibido→`entregado`) · 13 Rechazado (o flag `rechazado`) · otro → `otro` + aviso en `revisar`.
- Un CHQOCA unido a un Chq emitido `pendiente_debito` pasa a `debitado` si `pagado` o tiene `fecha_conciliado`.
- `fechaAcreditacion` en `cheques` = `fechaConciliado` de CHQOCA (ya viene de Vientri; **no se calcula**).
- Campo `revisar[]` = razones para revisión manual (fecha imposible, importe ≤ 0, estado desconocido, baja sin reemplazo…). Se vuelca a `observaciones` del cheque.

### 3.3 Mapeo Vientri → `cheques` (`cheques/domain/mapear-vientri.ts`)
| Estado Vientri | Estado Bacarnet |
|---|---|
| en_cartera | `en_cartera` |
| depositado | `depositado` |
| vendido | `vendido` |
| rechazado | `rechazado` |
| entregado | `en_cartera` (¡ojo!) |
| pendiente_debito | `pendiente` |
| debitado | `debitado` |
| renovado | `renovado` |
| anulado / otro | **se descarta** (no entra a `cheques`) |

También se descartan: bajas, número vacío o con `/`, monto ≤ 0.
- `origen`: emitido → `propio`. Recibido → `tercero` por defecto; `cliente` si alguna persona involucrada (librador, entregadoPor, entregadoA) tiene `esCliente` en `vientriPersonas` (`clasificarOrigenPorPersonas`).
- `utilizado` = `debitado` o `vendido` o estado Vientri `entregado`.
- `cliente` solo se llena para recibidos clasificados como cliente.

### 3.4 Cómo escribe `sincronizarChequesDesdeVientri`
- ID del doc = `chequeDocId(direccion, numero)`.
- Solo escribe si **cambió** algo relevante (estado, monto, estadoBancario, fechaPago, comprobantes, origen, ocasional, interés encubierto…). Si no, `sinCambios`.
- `merge: true` en updates: **no pisa** campos que Bacarnet agrega por su cuenta (`pagoDe`, `movimientoBancarioId`, `renovadoManualmente`, `pendienteRenovacion`, etc.).
- Si cambia el estado → guarda una fila en la subcolección `historialEstados` (origen `vientri`).
- Enriquece con CHQOCA (`ocasionalEnriquecido`, `esProveedorFinanciero`, `esRenovacion`, `operacionUsd`, `renovacionDe`, `renovadoPor`) y calcula `esInteresEncubierto` / `beneficiarioRealFinanciero` cruzando el destinatario con `proveedoresFinancieros`.
- Al final llama `reconciliarChequesConMovimientos()` (ver §5). Si falla, los cheques igual quedan sincronizados.

---

## 4. Modelo de datos (`cheques/domain/cheque.types.ts`)

Colección **`cheques`**, doc id = `chequeDocId(direccion, numero)`. Subcolección **`historialEstados`**.

**Valores base:** `tipo` `echeq|fisico` · `direccion` `recibido|emitido` · `origen` `cliente|tercero|propio` · `estado` `en_cartera|depositado|vendido|rechazado|pendiente|debitado|renovado`.

Estados por dirección (lo que usa la UI): recibidos → `en_cartera, depositado, vendido, rechazado`; emitidos → `pendiente, debitado, rechazado, renovado`.

| Grupo | Campos |
|---|---|
| Identidad | `numero`, `tipo`, `direccion`, `origen`, `cmc7` |
| Plata y fechas | `montoCentavos`, `fechaEmision`, `fechaPago` (vencimiento), `fechaRecibido`, `fechaEntregado`, `fechaAcreditacion` |
| Personas | `emisor`, `emisorCuit`, `bancoEmisor`, `bancoEmisorCodigo`, `cliente`, `endosante`, `destinatario` |
| Estado | `estado`, `estadoBancario` (texto de Vientri), `utilizado`, `observaciones` |
| Vínculo bancario | `movimientoBancarioId`, `movimientoCuentaId`, `movimientoFecha` |
| Agenda | `pagoDe {compromisoId, proveedorONombre, concepto}` — el compromiso que este cheque paga |
| Vientri | `vientriSync`, `vientriSyncAt`, `vientriClave`, `vientriCmpIngreso(+Desc)`, `vientriCmpSalida(+Desc)`, `vientriCmpNdRechazo`, `vientriCmpPagoBanco`, `vientriEstadoPrevio`, `vientriMotivoRechazoId` |
| Renovación | `pendienteRenovacion`, `pendienteRenovacionDesde`, `pendienteRenovacionPorUid`, `renovadoManualmente`, `renovacionDe[]`, `renovadoPor[]`, `operacionId` |
| Ocasionales (no tipados en `ChequeDocument`, sí en la API) | `ocasionalEnriquecido`, `esProveedorFinanciero`, `esRenovacion`, `tipoProveedor`, `operacionUsd`, `esInteresEncubierto`, `beneficiarioRealFinanciero` |
| Auditoría | `createdAt`, `updatedAt`, `createdBy` |

Otras colecciones relacionadas:
- `vientriCheques` (doc `chq-<id>` / `oca-<id>`): espejo crudo de Vientri, con `facturasIngreso` / `facturasEgreso`.
- `vientriChequesOcasionales` (doc id = `vientriId`): ver §7.
- `renovacionesChequesAgrupados`: seguimiento persistido (derivado, se regenera).
- `operacionesDolares` (ver §8).
- `proveedoresFinancieros` (módulo Agenda, compartida).
- `movimientosBancarios`: lleva `reservadoPorChequeId` (1 cheque) o `reservadoPorChequeIds[]` (lote) cuando ya está conciliado.

---

## 5. Conciliación cheque ↔ movimiento bancario

**Objetivo:** saber si un cheque ya impactó en el banco. **Solo traza**: no mueve plata ni toca saldos/caja (salvo la excepción de más abajo: `pendiente`→`debitado`).

`reconciliarChequesConMovimientos()` (`cheques/services/reconciliar-cheques-movimientos.ts`), se dispara tras cada sync de Vientri y a mano con `POST /api/finanzas/cheques/reconciliar?detalle=1`:

1. **`debitarChequesPendientesConMovimiento`**: emitidos `pendiente` que ya tienen movimiento → pasan a `debitado` (con historial, origen `reconciliacion`). *Es el único cambio de estado automático por conciliación.*
2. Junta cheques sin vincular (recibidos, emitidos, **y ocasionales** `oca:<id>`) y los ya vinculados.
3. **Gemelos** (`gemelos-cheque.ts`): un físico con número largo (`020-923-5000-40074070`) y su eCheq (`40074070`) son el mismo cheque cargado dos veces (mismo monto y vencimiento, un número termina en el otro, ≥ 6 dígitos). Si uno ya está vinculado, el gemelo **hereda** el vínculo. Los grupos se concilian juntos.
4. Trae `movimientosBancarios` con `fechaProceso` entre `(menor fechaPago − 10 días)` y `(mayor fechaPago + 35 días)`, ignorando los ya reservados (`reservadoPorTransferenciaId`, `reservadoPorChequeId`).
5. **`claseMovimientoCheque`** (`contraparte/domain/fuente-cheque.ts`) decide si un movimiento es cheque: débito de cheque propio (textos como `CHEQUE CAMARA LOCAL`, `ECHEQ CAMARA`, `CH DEP 72`, `DEB AUT RECIB CAMARA`…) → `emitido`; crédito de cheque depositado (`DEPOSITO ECHEQ`, `DEP. VALORES CAMARA`, `CH DEP 48`) → `recibido`. Los textos están hardcodeados: un texto bancario nuevo se agrega ahí.
6. **Dos pasadas**, en ambas se vincula **solo si hay exactamente 1 candidato**:
   - **Pasada 1 (solo número):** `voucherNumber` y luego `correlativeNumber` del movimiento contra el número del cheque (solo dígitos, sin ceros a la izquierda; coincidencia exacta o por sufijo si ≥ 6 dígitos) **y monto exacto**.
   - **Pasada 2 (monto + fecha):** monto exacto y fecha del movimiento dentro de `[-1, +5]` días de la **fecha base** (`fechaPago` si difiere de `fechaEmision`, si no `fechaEmision`); `[-1, +15]` para cheques rechazados. Si hay varios, solo gana el estrictamente más cercano.
7. Al vincular: escribe `movimientoBancarioId/CuentaId/Fecha` en el cheque, `reservadoPorChequeId` en el movimiento y, para **recibidos**, `fechaAcreditacion = fechaProceso`.
8. Resultado: `{revisados, vinculados, sinCandidato, multiples, diagnostico?}`.

### Conciliar un lote (`conciliar-lote-cheques.ts`, ruta en movimientos: `POST /api/finanzas/movimientos/:id/conciliar-lote`)
Cuando el banco compensa varios cheques en **una sola línea**: `buscarCombinacionDeCheques` (backtracking) busca qué subconjunto de cheques sin vincular, con vencimiento ±1 día del movimiento, suma exacto el monto. Máx. 22 candidatos. Si hay 0 combinaciones, 2+ combinaciones (ambigua) o demasiados candidatos → **no elige**. Solo concilia si una persona confirma la lista; escribe `reservadoPorChequeIds`. Requiere permiso `finanzas_categorias`.

### Mantenimiento
- `POST /desvincular-fuera-de-ventana?dryRun=1`: desvincula emitidos cuyo movimiento está fuera de `[-1,+5]` días (si estaban `debitado` vuelven a `pendiente`).
- `POST /corregir-pago-proveedor?dryRun=1`: emitidos `debitado` con `estadoBancario` "pago a proveedor"/"diferido" y **sin movimiento** vuelven a `pendiente` (no está debitado hasta que el banco lo mueva).

> Regla de negocio que explica estas ventanas (`docs/analisis-mejoras-cheques.md`): un cheque tiene **30 días corridos** para depositarse desde su fecha base. Hay una propuesta de ampliar la ventana a 30 días; **el código actual sigue con `-1/+5`**. No cambies la ventana sin hablarlo: sube los falsos positivos.

---

## 6. Renovación de cheques (flujo manual en Bacarnet)

Concepto: un cheque no se "paga", se **renueva**. Mientras no se carga el nuevo, queda en una cola.

1. **Marcar pendiente de renovar** — `POST /:id/marcar-pendiente-renovar`. Pone `pendienteRenovacion: true`. Lo saca de "A pagar" en Hoy (`chequeEmitidoVigente` lo excluye). Botón "Renovar" en Hoy.
2. **Cola** — `GET /pendientes-de-renovar`. UI: Cheques › Ocasionales › Renovaciones › **Pendientes de renovar** (`PendientesDeRenovar.tsx`).
3. **Confirmar** — `POST /confirmar-renovacion` (1 nuevo) o `POST /confirmar-renovacion-batch` (N nuevos + `operacionId` opcional). En una **transacción**: los viejos pasan a `estado: 'renovado'`, `renovadoManualmente: true`, `pendienteRenovacion: false`, `renovadoPor[]`; los nuevos se crean como cheque emitido físico (`origen: propio`, `estado: en_cartera`, `renovadoManualmente: true`, `renovacionDe[]`) o, si ya los trajo Vientri, solo se les agrega `renovacionDe`. Errores: 404 no existe, 409 ya renovado / el nuevo ya existe.

**Regla crítica:** `renovadoManualmente` **nunca lo toca el sync de Vientri**. Así, si Vientri todavía no vio la renovación, el próximo sync no la "deshace". Si tocás el sync, preservá esto.

**Limitación conocida (de CLAUDE.md):** "Renovar" desde "Compromisos de esta semana" en Hoy solo funciona para un cheque que vence **hoy** (falta llevar el `chequeId` para otros días).

---

## 7. Cheques Ocasionales (CHQOCA) — el circuito financiero informal

> Detalle completo en `backend/src/modules/finanzas/vientri/CHEQUES_OCASIONALES.md`, `PLAN_OPERACIONES_RENOVACION.md` y `RELEVAMIENTO_OCASIONALES.md`. Acá va lo esencial. Algunos nombres de archivo en esos docs ya no coinciden 1:1 con el árbol: verificá con `ls` antes de citarlos.

**Qué es:** BACAR entrega cheques a "proveedores financieros" que prestan plata o cambian dólares. El cheque se **renueva** periódicamente por otro de mayor monto; la diferencia es el interés. Ej.: $5.000.000 → $5.800.000 (interés $800.000) → $6.700.000. En Vientri los beneficiarios figuran como proveedores comunes, por eso hay que **clasificarlos**. La clasificación de proveedores financieros es **manual/asistida, nunca automática** (decisión del usuario: ningún patrón de datos distingue de forma confiable los tipos de circuito).

**Parseo del campo OBS** (`parsear-obs.ts`): detecta renovaciones (`Renovacion cheque n° 123`, `cheques 44001234/35/36`, `Renovacion` sola) y operaciones USD (`u$70.000 TC1565`, `usd 70.000 TC 1540`). En montos, el punto es separador de miles.

**Importación:** `importarChequesOcasionales` → colección `vientriChequesOcasionales`. Dos vías: automática desde el zip de Vientri, o CSV manual (`POST /api/finanzas/cheques-ocasionales/importar` o `node backend/scripts/vientri-cheques-ocasionales-importar.mjs --archivo ... [--simular|--prod]`). **`--prod` requiere OK del usuario.** Contra emulador usar `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` y `GCLOUD_PROJECT=bacar-web`.

**Modelo principal: operación de renovación** (`operacion-renovacion.ts`, `agruparOperacionesRenovacion`). Agrupa por `beneficiarioNormalizado + fechaEmision + banco`. Cómo vincula viejos con nuevos:
1. **Explícito**: el OBS del nuevo lista los IDs de los viejos.
2. **Implícito (auto-link)**: viejos del mismo beneficiario con `fechaConciliado` ≈ `fechaEmision` del nuevo (±2 días; es el mejor campo: 91,5 % exacto), con fallback a `fechaVencimiento`. Capas: por *operación origen* (agrupación por OBS+beneficiario+fechaEmisión), refinamiento por vencimiento ±5 días, fallback cross-operación, cadenas A→B→C, **bancos equivalentes** (`020-923-5000 ↔ 5010`), **beneficiarios compatibles** (comparten una palabra ≥ 3 letras por prefijo), cruce con cheques CHQ regulares (`inyectar-chq-autolink.ts`).
3. **Sanity check:** interés implícito entre **0 % y 50 %**; fuera de eso no se vincula.

> ⚠️ **No aplanes la agrupación por OBS+beneficiario+fecha a un índice plano** (decisión explícita del usuario): modela una operación coherente; aplanarla mezcla operaciones distintas del mismo beneficiario.

`cadena-renovacion.ts` (cadenas lineales) está **deprecado**, aunque `marcarRenovadosPorCadena` todavía la usa para marcar `renovado` en el import.

**Seguimiento** (`seguimiento.ts`, persistido en `renovacionesChequesAgrupados`): estado de cada cheque nuevo, primero que se cumple: baja → excluido · figura como viejo en otra operación o estado 5 → `renovado` · estado 9 → `anulado` · estado 3 → `rechazado` · `pagado` → `debitado` · si no → `pendiente`. **Exposición** = pendiente + rechazado. Una operación está **cerrada** si todos sus nuevos son debitado/anulado/renovado **y** el vencimiento máximo es anterior a hoy (se calcula al leer). Se recalcula al importar; forzar con `POST /cheques-ocasionales/seguimiento/recalcular`.

**Estados CHQOCA (`id_estado`):** 0 en cartera · 1 depositado · 2 vendido · 3 rechazado · 4 entregado · 5 **renovado** · 6 pendiente débito · 7 debitado · 9 anulado.

**Endpoints** (`/api/finanzas/cheques-ocasionales`): `GET /` (filtro `financiero|gasto_real|con_renovacion|con_usd`, `q`, `page`) · `/cadenas` · `/resumen` · `/operaciones-renovacion` · `/seguimiento?estado=abiertas|todas` · `/analisis-emitidos` · `/analisis-interes` · `/:id` · `POST /importar` · `POST /seguimiento/recalcular` · `POST /completos/recalcular`.

**Pendiente (de los docs):** sync de ocasionales de proveedores financieros con la Agenda como origen `ocasionales`; pantalla de resumen ejecutivo del costo financiero.

---

## 8. Operaciones en dólares / renovación en pesos (`/api/finanzas/operaciones-dolares`)

Registro **manual** de operaciones financieras (`operacionesDolares`): `tipo: 'usd'` (compra de USD pagada con cheques) o `'renovacion_pesos'`. Guarda cotización, tasa mensual, impuesto, cheques entregados con días/tasa equivalente/descuento/importe a liquidar y **costo financiero**. Altas/ediciones requieren permiso `finanzas_cheques`; se **anulan** (`POST /:id/anular`), no se borran. La renovación en pesos marca atómicamente los cheques viejos (`chequeViejoIds`) vía el flujo de §6. UI: `OperacionesDolares.tsx` (~1100 líneas).

---

## 9. Cheques ↔ Agenda ↔ Hoy

- **Agenda** (`vientri/domain/agenda-cheques.ts`, `sincronizar-agenda-cheques.ts`): cada cheque **emitido** pendiente (`en_cartera`/`pendiente_debito`, con vencimiento y monto > 0) crea un compromiso `vientri-cheque-<clave>` (grupo "Bancos", medio `cheque`). Debitado → compromiso pagado; anulado/rechazado/entregado/desaparecido → baja lógica; vuelve a pendiente → se reabre **solo si lo había cerrado Vientri** (lo cerrado por una persona se respeta). Si Finanzas reprogramó la fecha, **no se pisa**.
- **Hoy** (`hoy/domain/cheques-hoy.ts`):
  - `esChequeEnCartera`: recibido, `utilizado !== true` y estado fuera de rechazado/anulado/depositado/vendido/debitado.
  - `chequeEmitidoVigente`: emitido, estado no en {anulado, rechazado, debitado, renovado}, sin `pendienteRenovacion` ni `renovadoManualmente`.
  - "Cheques a debitar": los de hoy y el siguiente día hábil, con impacto por banco (usa saldos y descubierto; avisa si un banco se pasa).
  - **Pagar con cheque** (`hoy.acciones.ts`): *cartera* → endoso de un cheque recibido (`marcarChequeEndosado` pone `utilizado: true` + destinatario + `pagoDe`); *propio* → alta del emitido y `anotarChequePagoDe`. Ambos marcan el compromiso como pagado (`medioPago: 'cheque'`, `claseCheque: 'cartera'|'propio'`).
  - Aviso "ya tiene cheque emitido, solo falta debitarlo" vía `pagoDe`.
- **Tablero**: `src/components/tablero-finanzas/ChequesVentana.tsx`.

---

## 10. API — `/api/finanzas/cheques`

Todas pasan por `requireWorkspaceUser` + `requireViewFinanzas`. **Escritura** requiere permiso **`finanzas_cheques`** (`requireFinanzasPermiso`).

| Método y ruta | Qué hace |
|---|---|
| `GET /` | Listado paginado. Filtros: `direccion, origen, estado, tipo, vinculacion (vinculado\|sin_vincular), comprobante (con\|sin_comprobante), interesEncubierto, desde, hasta (por fechaPago), q (busca texto, número, monto), montoDesde, montoHasta (en **pesos**), page, limit (default 50, máx 100)`. Devuelve `total, totalCentavos, recibidosCentavos, emitidosCentavos, cheques`. |
| `GET /resumen-diario` | Cheques recibidos a cobrar hoy y próximos. |
| `GET /:id` · `GET /:id/detalle` | Cheque; el detalle suma movimiento bancario, comprobantes Vientri y facturas de ingreso/egreso. |
| `GET /pendientes-de-renovar` | Cola de renovación. |
| `POST /sincronizar-vientri` | Fuerza vientriCheques → cheques (y reconcilia). |
| `POST /reconciliar?detalle=1` | Fuerza la conciliación con diagnóstico. |
| `PATCH /:id/estado` | Cambia estado a mano (con historial `manual`). |
| `POST /:id/marcar-pendiente-renovar` · `/confirmar-renovacion` · `/confirmar-renovacion-batch` | Ver §6. |
| `POST /desvincular-fuera-de-ventana` · `/corregir-pago-proveedor` | Mantenimiento (aceptan `?dryRun=1`). |
| `POST /import` · `POST /ingresar` | **Legado** (Excel `.xlsx/.xls` y pegado desde la UI). Siguen en el código y en la UI ("Importar Excel", "Ingresar cheques"); la fuente oficial ahora es Vientri. No los extiendas sin preguntar. |

Conciliar lote: `POST /api/finanzas/movimientos/:id/conciliar-lote`. Vientri (solo lectura): `/api/finanzas/vientri/{estado,cheques,pendientes,limpieza}`, `POST /vientri/traer-ahora`.

---

## 11. Frontend

- **Ruta:** `/finanzas/cheques` → `src/pages/finanzas/ChequesPage.tsx` (~1270 líneas, componente `FinanzasChequesPage`, título "Chequera Virtual"). Nav en `finanzasNavConfig.ts`.
- **Pestañas:** Recibidos · Emitidos · **Ocasionales**. Sub-filtro por tipo (Todos/eCheq/Físicos). Filtros: origen, estado, vinculación con banco, comprobante, rango de vencimiento (por defecto el mes actual, recordado en `sessionStorage`), **monto desde/hasta**, buscador con debounce de 400 ms.
- **Acciones de escritura** (visibles solo con permiso `cheques` en `usePermisosFinanzas`): "Ingresar cheques" (pegar TSV), "Importar Excel", cambio de estado.
- **Ocasionales** → `PestanaOcasionales.tsx` con sub-vistas: `OperacionesRenovacion.tsx`, `SeguimientoRenovaciones.tsx`, `PendientesDeRenovar.tsx`, `CadenasRenovacion.tsx`, `OperacionesDolares.tsx`.
- **Contrato con el back:** `src/services/finanzasChequesApi.ts` (tipos espejo + `fetch*`). Mantener sincronizado con los tipos de `cheques.repository.ts` (`ChequeListadoItem`).
- **Guía de recorrido:** `src/components/finanzas/recorrido/guias/cheques.ts`.
- **Pago con cheque en Hoy:** `src/components/finanzas/hoy/pagoConCheque.ts` **debe coincidir** con `backend/.../hoy/domain/pago-con-cheque.ts`.
- Sobre las columnas/estilos concretos de la tabla no hay doc: leé el componente antes de tocarlo.

---

## 12. Mapa de archivos

```
backend/src/modules/finanzas/
├── cheques/
│   ├── domain/        cheque.types · mapear-vientri · gemelos-cheque · combinacion-cheques · filtro-monto · banco-bcra
│   ├── routes/        cheques.routes.ts
│   └── services/      cheques.repository (Firestore, 1077 l.) · cheques.service (listado + import Excel legado) ·
│                      sincronizar-desde-vientri · reconciliar-cheques-movimientos · conciliar-lote-cheques ·
│                      ocasionales-vinculo.repository
├── contraparte/domain/fuente-cheque.ts     matching cheque↔movimiento (claseMovimientoCheque, chequesCandidatos)
├── hoy/domain/cheques-hoy.ts, pago-con-cheque.ts   + hoy/services/hoy.acciones.ts (endoso / cheque propio)
├── movimientos/routes/movimientos.routes.ts        conciliar-lote
└── vientri/
    ├── CHEQUES_OCASIONALES.md · PLAN_OPERACIONES_RENOVACION.md · RELEVAMIENTO_OCASIONALES.md
    ├── domain/        cheques (armarCheques) · tipos · ventana · agenda-cheques · cheques-renovados ·
    │                  clasificar-cheque-proveedor · cheque-ocasional.types · parsear-obs · operacion-renovacion ·
    │                  seguimiento(.types) · cadena-renovacion (deprec.) · operacion-dolares(.types) · analisis-*
    ├── routes/        vientri · cheques-ocasionales · operaciones-dolares
    └── services/      importar-vientri · traer-desde-drive · importar-cheques-ocasionales · recalcular-seguimiento ·
                       sincronizar-agenda-cheques · inyectar-chq-autolink · completar-eslabones-vientri · operaciones-dolares.repository
backend/scripts/vientri-cheques-ocasionales-importar.mjs
scripts/vientri-export/{exportar_vientri.ps1, sql/05_cheques.sql, sql/06_cheques_propios.sql}

src/pages/finanzas/ChequesPage.tsx
src/components/finanzas/cheques/*.tsx
src/components/tablero-finanzas/ChequesVentana.tsx
src/services/finanzasChequesApi.ts
```

Tests: `npm run test:finanzas`. Específicos: `npx vitest run backend/src/modules/finanzas/vientri/domain/operacion-renovacion.test.ts` (y análogos `seguimiento`, `parsear-obs`, `agenda-cheques`, `cheques-renovados`), `.../cheques/services/cheques-renovacion-manual.test.ts`, `.../cheques/domain/*.test.ts`.

---

## 13. Trampas y cosas que sorprenden

1. **Dos fuentes que coexisten:** `vientriCheques` (espejo crudo) y `cheques` (lo que usa la UI). Se sincronizan con `sincronizarChequesDesdeVientri`. La carga Excel es legado.
2. **Estado `entregado` de Vientri → `en_cartera`** en Bacarnet, pero `utilizado: true`. Por eso "en cartera" + `utilizado` es la forma de saber si se puede usar.
3. **Los anulados de Vientri no entran a `cheques`**: `vientriChequeToRow` devuelve `null` para esos estados y el sync no actualiza ese doc. *Inferencia (no probada):* un cheque que ya estaba en `cheques` y luego se anula en Vientri probablemente queda con su último estado. Verificalo en el emulador antes de asumir.
4. **`pendiente` ≠ `debitado` hasta que haya movimiento bancario.** "Pago a proveedor" en Vientri no significa debitado.
5. **El mismo cheque puede existir dos veces** (físico + eCheq): ver gemelos. Cualquier conteo/suma debe considerarlo.
6. **Cheques ocasionales conciliables llevan id `oca:<id>`** y viven en otra colección; las funciones de vínculo despachan por prefijo (`vincularCualquiera`).
7. **Ventana de 12 meses:** cheques más viejos no se importan; no es un bug que falten.
8. **El filtro de listado combina query Firestore + filtros en memoria** (`vinculacion`, `comprobante`, `q`, `interesEncubierto`, monto). Con más filtros en memoria la paginación puede ser costosa; ojo con colecciones grandes.
9. **`ChequeDocument` no declara los campos de ocasionales**, aunque la API y la UI sí los usan.
10. **Montos del filtro** llegan en **pesos** por query string y se convierten a centavos en el backend.
11. **Fechas imposibles** en Vientri (ej. año 2206) se marcan en `revisar`; no se corrigen solas.

---

## 14. Estado actual y pendientes conocidos

- Hecho: sync Vientri→cheques, conciliación por número/monto con gemelos y ocasionales, conciliación de lotes con confirmación, renovación manual (individual y batch), operaciones USD/renovación en pesos, seguimiento de renovaciones, cola de pendientes, filtro por monto, integración con Agenda y Hoy.
- Pendiente (documentado): sync de ocasionales con Agenda (origen `ocasionales`), resumen ejecutivo del costo financiero, importación automática completa de la copia Vientri para ocasionales, "Renovar" desde Hoy para cheques que no vencen hoy, ventana de 30 días en la conciliación (propuesta), sueldos como "día pesado" (depende de `rrhh/salario/`, no está mergeado).
- Abierto: ticket #2307 — ~$1.090M de movimientos bancarios sin conciliar contra ningún compromiso (sin investigar).
- Revisión pendiente en Finanzas: ~99 cheques de Banco Córdoba sin débito.

---

## 15. Cómo trabajar en este módulo (checklist)

1. Leé `REGLAS.md`, `CLAUDE.md` y este documento. Confirmá la rama (`feature/*`); no trabajes sobre `main`.
2. Probá **siempre contra el emulador** (Firestore en `127.0.0.1:8080`, proyecto `bacar-web`). Nunca contra producción sin OK explícito.
3. Lógica nueva → función **pura** en `domain/` con test; Firestore solo en `services/`.
4. Cambiás un tipo de API → actualizá `finanzasChequesApi.ts` y el repositorio en el mismo cambio.
5. Cualquier cosa que **mueva plata, concilie o cambie estados** debe ser conservadora: ante duda, no actuar y avisar.
6. Antes de dar algo por terminado: `npm run test:finanzas`, `npx tsc -b`, `npx tsc --noEmit -p backend`, `npm run build`, y revisá `git diff`.
7. **No commitees, pushees, abras PR ni deployes** sin que el usuario lo pida. Si tocás archivos compartidos, listalos.
8. Si algo de este doc no coincide con el código, **confiá en el código** y corregí este doc.
