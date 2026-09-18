# Módulo Finanzas — convenciones de UI

## Formularios (regla transversal)

Todo formulario bajo `/finanzas/*` (Agenda, Créditos, Caja chica, etc.) debe cumplir:

1. **Etiqueta visible** arriba (o al costado) de **cada** control, permanente mientras el usuario completa el campo. No usar el placeholder como única referencia del dato.
2. Los placeholders, si se usan, son **ayuda opcional** (ejemplo de formato), no el nombre del campo.
3. Desplegables sin opciones reales: mostrar un ítem explícito del tipo «No hay … pendientes para vincular» (deshabilitado), no un `<select>` vacío sin explicación.

Implementación recomendada: componente `FinanzasFormField` + clase `finanzasInputClass`.
