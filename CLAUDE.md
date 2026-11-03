# Bacarnet — contexto para agentes

Corto a propósito. Detalle en `REGLAS.md` (manda sobre todo) y `src/components/finanzas/FINANZAS_MODULE.md`.

## Stack
- Frontend: React 19 + Vite + TS + Tailwind en `src/`.
- Backend: Express sobre Firebase Cloud Functions en `backend/`, Firestore vía `adminDb()`.
- Módulos backend: `backend/src/modules/<area>/<modulo>/{domain,services,routes}`. Copiar el patrón de `finanzas/cajachica` y `finanzas/agenda`.

## Convenciones
- Montos en **centavos enteros**. Fechas de negocio 'YYYY-MM-DD', guardadas al mediodía AR: `Timestamp.fromDate(new Date(`${ymd}T12:00:00-03:00`))`.
- Errores en palabras simples: `res.status(400).json({ error: '...' })`.
- Pantallas para gerentes de Finanzas: textos simples, sin jerga. Formularios con `FinanzasFormField` + `finanzasInputClass`; montos con `formatMoneyCentavos`.
- No se borra nada: baja lógica (`anulado`, `estado: 'inactivo'`).
- Contratos front↔back en `src/services/finanzas*Api.ts`: si cambia uno, cambian los dos lados.

## Archivos compartidos (tocar con cuidado y listar en el PR)
`backend/src/modules/finanzas/routes/index.ts`, `finanzasNavConfig.ts`, `src/routes/AppRoutes.tsx`, `src/pages/index.ts`, `firestore.rules`, `backend/src/modules/auth/middleware.ts`.

## Verificar antes de entregar
`npm run test:finanzas` · `npx tsc -b` · `npx tsc --noEmit -p backend` · `npm run build`

## Prohibido
- Datos reales (el Excel de Finanzas), secretos o `.env` en el repo.
- Deploy, push o PR sin permiso del usuario.

## Delegación
- Una tarea = un agente nuevo (nunca retomar un chat). Prompt autocontenido: objetivo, archivos con ruta, restricciones y criterio de "terminado".
- Se lanza con los scripts de `C:\Users\Admin\.cursor-uso\` (`ia-gratis-tarea.ps1` o `cursor-tarea.ps1`). Esos scripts existen solo en esta PC.
- Siempre revisar con `git diff` y los tests antes de dar algo por terminado.

## En curso: Inversiones Parte 1 (rama `feature/inversores-base`)
- Hecho: dominio + tests en `backend/src/modules/finanzas/inversiones/domain/`; contrato API en `src/services/finanzasInversionesApi.ts`; origen `inversiones`/`planilla` y `anulado` en la Agenda.
- Falta: repos/servicio/rutas de Inversiones, permisos (`finanzas_inversiones`, `finanzas_inversiones_aprobar`), sync con la Agenda, importador de la planilla (`hoy/domain/planilla-excel.ts`) y pantallas.

## En curso: Pantalla Hoy — mejora continua (02-03/11, todo en `main`, deployado)
- Hecho hoy (PR #92-#98, #102, #104, #106-#110): KPI sin doble conteo ni ignorar USD, cheques sueltos sumados en Hoy y en la semana, cola manual de renovación de cheques (`Cheques > Ocasionales > Renovaciones > Pendientes de renovar`, campo `renovadoManualmente` en el doc del cheque para que el sync de Vientri nunca lo revierta), tarjetas colapsables por fila, etiqueta de origen (Vientri/Inversor/Proveedor financiero) en todos los lugares donde se ve plata, semana unificada en un solo bloque dentro de "Compromisos de esta semana", fix de e-cheques mal agrupados como "cheque físico".
- Decisión pendiente del usuario: si el gráfico de barras "Esta semana" (pagos/cobros por día) también se fusiona al bloque unificado, o queda aparte (hoy queda aparte).
- Limitación conocida: "Renovar" desde Compromisos de la semana solo funciona para un cheque que vence **hoy** (falta llevar el `chequeId` para otros días).
- Pendiente sin empezar: sueldos como "día pesado" todavía no tiene el monto real (el módulo `rrhh/salario/` que lo daría no está terminado ni mergeado); por ahora solo marca el día en rojo sin monto.
- Ticket #2307 (Jose): ~$1.090M de movimientos bancarios sin conciliar contra ningún compromiso — no investigado todavía.
- Trabajo activo en el worktree `C:\Users\Admin\Desktop\intranet1-guia-hoy` (rama `main`, sincronizada), no en la carpeta compartida.
