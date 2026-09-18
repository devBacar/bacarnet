import { formatHelpdeskDateTime } from './helpdeskUi'
import type {
  HelpdeskCampanaArchivoFila,
  HelpdeskCampanaAuditoriaRow,
} from '../../services/helpdeskApi'

function flagLabel(value: boolean | null, fecha: string | null): string {
  if (value === true) {
    const when = formatHelpdeskDateTime(fecha)
    return when === '—' ? 'Sí' : `Sí · ${when}`
  }
  if (value === false) return 'No'
  return '—'
}

type LiveRow = HelpdeskCampanaAuditoriaRow
type ArchivedRow = HelpdeskCampanaArchivoFila

export function HelpdeskCampanaAuditoriaTable({
  mode,
  rows,
  testIdPrefix = 'helpdesk-campana-auditoria',
}: {
  mode: 'live' | 'archived'
  rows: LiveRow[] | ArchivedRow[]
  testIdPrefix?: string
}) {
  if (mode === 'archived') {
    const archived = rows as ArchivedRow[]
    return (
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-body-muted dark:border-zinc-800">
            <tr>
              <th className="px-4 py-3">Área</th>
              <th className="px-4 py-3">Jefe</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Enviado</th>
              <th className="px-4 py-3">Respondió</th>
            </tr>
          </thead>
          <tbody>
            {archived.map((row, index) => (
              <tr
                key={`${row.email ?? 'row'}-${index}`}
                className="border-b border-neutral-100 last:border-0 dark:border-zinc-800"
                data-testid={`${testIdPrefix}-row`}
                data-archived-row="true"
              >
                <td className="px-4 py-3 font-medium text-heading">{row.area ?? '—'}</td>
                <td className="px-4 py-3 text-heading">{row.jefe ?? '—'}</td>
                <td className="px-4 py-3 text-body-muted">{row.email ?? '—'}</td>
                <td className="px-4 py-3 text-body-muted">
                  {flagLabel(row.enviado, row.fechaEnvio)}
                </td>
                <td className="px-4 py-3 text-body-muted">
                  {flagLabel(row.respondido, row.fechaRespuesta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const live = rows as LiveRow[]
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-body-muted dark:border-zinc-800">
          <tr>
            <th className="px-4 py-3">Área</th>
            <th className="px-4 py-3">Jefe</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Enviado</th>
            <th className="px-4 py-3">Respondió mail</th>
            <th className="px-4 py-3">Formulario (link)</th>
            <th className="px-4 py-3">Cumple campaña</th>
          </tr>
        </thead>
        <tbody>
          {live.map((row, index) => (
            <tr
              key={`${row.email ?? 'row'}-${index}`}
              className="border-b border-neutral-100 last:border-0 dark:border-zinc-800"
              data-testid={`${testIdPrefix}-row`}
              data-campana-cumplida={row.campana_cumplida === true ? 'true' : 'false'}
            >
              <td className="px-4 py-3 font-medium text-heading">{row.area ?? '—'}</td>
              <td className="px-4 py-3 text-heading">{row.nombre ?? '—'}</td>
              <td className="px-4 py-3 text-body-muted">{row.email ?? '—'}</td>
              <td className="px-4 py-3 text-body-muted">{flagLabel(row.enviado, row.fecha_envio)}</td>
              <td className="px-4 py-3 text-body-muted">{flagLabel(row.respondio_correo, null)}</td>
              <td className="px-4 py-3 text-body-muted">
                {flagLabel(row.respondio_formulario, row.fecha_formulario)}
              </td>
              <td className="px-4 py-3 font-medium text-heading">
                {flagLabel(row.campana_cumplida, null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
