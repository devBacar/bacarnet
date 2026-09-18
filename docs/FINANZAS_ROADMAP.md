# Finanzas — roadmap (resumen)

Vista rápida del módulo `/finanzas/*` para priorizar ramas `feature/*` / `fix/*`. **No reemplaza el spec de producto.**

## Spec y convenciones

| Documento | Qué cubre |
|-----------|-----------|
| **[Spec de producto — Módulo Finanzas](https://claude.ai/code/artifact/c609b6f3-494a-4022-b124-7689a19900a3)** | Fases, reglas de negocio, pantallas y criterios de aceptación. **Fuente de detalle completo** (pestañas por fase). |
| [FINANZAS_MODULE.md](../src/components/finanzas/FINANZAS_MODULE.md) | Convenciones de UI en el código (formularios, cheques recibido/emitido, navbar). |
| [REGLAS.md](../REGLAS.md) | Flujo de trabajo del repo y reglas generales. |

## Estado por bloque

| Bloque | Ruta / API | Estado en repo | Notas breves |
|--------|------------|----------------|--------------|
| **Saldos** | `/finanzas/cuentas`, `GET /api/finanzas/cuentas` | **Hecho** | Posición, cuentas mock/seed; semáforo CC con umbrales a formalizar en spec/config. |
| **Cheques** | `/finanzas/cheques`, `/api/finanzas/cheques/*` | **Hecho** | Flujos **recibido** y **emitido** separados; sub-nav Recibidos \| Emitidos. |
| **Agenda** | `/finanzas/agenda`, `/api/finanzas/agenda/*` | **Hecho** | Compromisos y cobros; pendientes de UX de formularios según `FINANZAS_MODULE.md`. |
| **Créditos** | — | **No iniciado** | Próxima fase grande candidata; ver spec. |
| **Caja chica** | — | **No iniciado** | Ver spec. |
| **Transferencias** | — | **No iniciado** | Ver spec; suele depender de cuentas/agenda estables. |

## Cómo sumar una sección nueva

1. Backend en `backend/src/modules/finanzas/<seccion>/`.
2. Ruta anidada bajo `FinanzasLayout` en `AppRoutes`.
3. Entrada en `FINANZAS_NAV_ITEMS` (`finanzasNavConfig.ts`) — **no** ítem suelto en la navbar global.
4. PR atómico + `npm run build` y `npm run test:finanzas` si hay backend Finanzas.
