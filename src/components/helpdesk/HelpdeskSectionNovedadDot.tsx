export function HelpdeskSectionNovedadDot({ seccion }: { seccion: string }) {
  return (
    <span
      className="relative inline-flex h-2 w-2 shrink-0"
      aria-label="Novedades sin revisar"
      data-testid={`helpdesk-section-novedad-${seccion}`}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
    </span>
  )
}
