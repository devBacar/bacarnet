# Módulo Finanzas — convenciones de UI

## Formularios (regla transversal)

Todo formulario bajo `/finanzas/*` (Cheques, Agenda, Créditos, Caja chica, etc.) debe cumplir:

1. **Etiqueta visible** arriba (o al costado) de **cada** control, permanente mientras el usuario completa el campo. No usar el placeholder como única referencia del dato.
2. Los placeholders, si se usan, son **ayuda opcional** (ejemplo de formato), no el nombre del campo.
3. Desplegables sin opciones reales: mostrar un ítem explícito del tipo «No hay … pendientes para vincular» (deshabilitado), no un `<select>` vacío sin explicación.

Implementación recomendada: componente `FinanzasFormField` + clase `finanzasInputClass`.

## Cheques: recibido vs emitido

- Campo `direccion`: `"recibido"` | `"emitido"`. Dos flujos distintos (estados, acciones y formularios).
- **Recibidos:** librador, banco emisor externo, estados en cartera → depositado/endosado/vendido → acreditado/rechazado.
- **Emitidos:** cuenta CC propia (`cuentaId`), beneficiario, estados emitido → entregado → debitado | rechazado, o emitido → anulado.
- UI: pestaña Recibidos | Emitidos en `/finanzas/cheques`; rechazo de emitido con alerta grave (`ChequeEmitidoRechazadoAlert`).
