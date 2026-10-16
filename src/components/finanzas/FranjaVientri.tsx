import type { EstadoVientri } from '../../services/finanzasVientriApi'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "2026-10-15T10:04:00" (hora Argentina, sin zona) → "jueves 15/10, 10:04". */
export function textoFechaDatos(fechaDatos: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(fechaDatos)
  if (!m) return fechaDatos
  const dia = DIAS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()]
  const hora = m[4] ? `, ${m[4]}:${m[5]}` : ''
  return `${dia} ${m[3]}/${m[2]}${hora}`
}

/** Horas desde la fecha de los datos (hora Argentina). */
export function horasDesde(fechaDatos: string, ahora: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(fechaDatos)
  if (!m) return Number.POSITIVE_INFINITY
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0) + 3, Number(m[5] ?? 0))
  return (ahora.getTime() - utc) / 3_600_000
}

/** Franja fija con la fecha de los datos de Vientri: verde, amarilla o roja según su antigüedad. */
export function FranjaVientri({ estado, cargando }: { estado: EstadoVientri | null | undefined; cargando?: boolean }) {
  if (cargando) {
    return (
      <div className="mb-4 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-base text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
        Buscando la fecha de los datos de Vientri…
      </div>
    )
  }
  if (!estado?.fechaDatos) {
    return (
      <div role="status" className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-base font-semibold text-red-900 dark:bg-red-950 dark:text-red-100">
        Todavía no se importaron datos de Vientri.
      </div>
    )
  }
  const horas = horasDesde(estado.fechaDatos)
  const texto = textoFechaDatos(estado.fechaDatos)
  const nivel = !estado.ok || horas > 50 ? 'rojo' : horas > 26 ? 'amarillo' : 'verde'
  const estilos = {
    verde: 'border-green-600 bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-50',
    amarillo: 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50',
    rojo: 'border-red-500 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-50',
  }[nivel]
  const punto = { verde: 'bg-green-600', amarillo: 'bg-amber-500', rojo: 'bg-red-600' }[nivel]
  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-base ${estilos}`}>
      <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${punto}`} aria-hidden />
      <p>
        {nivel === 'verde' ? (
          <>
            <strong>Datos de Vientri al {texto}.</strong> Lo cargado en Vientri después de esa hora todavía no aparece.
          </>
        ) : nivel === 'amarillo' ? (
          <>
            <strong>Atención: datos de Vientri del {texto}.</strong> Puede faltar lo cargado después.
          </>
        ) : (
          <>
            <strong>Los datos de Vientri no se actualizan desde el {texto}.</strong> Avisá a Sistemas.
          </>
        )}
      </p>
    </div>
  )
}
