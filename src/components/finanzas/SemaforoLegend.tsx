export function SemaforoLegend() {
  return (
    <p className="text-body-muted rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
      <span className="text-heading font-medium">Semáforo:</span>{' '}
      <span aria-hidden>🟢</span> con margen · <span aria-hidden>🟡</span> atención ·{' '}
      <span aria-hidden>🔴</span> superado — aplica solo a Cuenta Corriente.
    </p>
  )
}
