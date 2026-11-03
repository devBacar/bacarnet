import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { parseMontoEsArACentavos } from '../montoEsAr'
import {
  confirmarRenovacionCheques,
  fetchPendientesDeRenovar,
  type ChequePendienteDeRenovar,
} from '../../../services/finanzasChequesApi'

function fechaCorta(ymd: string): string {
  const [anio, mes, dia] = ymd.split('-')
  if (!anio || !mes || !dia) return ymd
  return `${Number(dia)}/${Number(mes)}/${anio}`
}

export function PendientesDeRenovar() {
  const queryClient = useQueryClient()
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [cargandoPara, setCargandoPara] = useState<Set<string> | null>(null)
  const [numero, setNumero] = useState('')
  const [bancoEmisor, setBancoEmisor] = useState('')
  const [fechaPago, setFechaPago] = useState('')
  const [montoTexto, setMontoTexto] = useState('')
  const [destinatario, setDestinatario] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['finanzas', 'cheques', 'pendientes-de-renovar'],
    queryFn: fetchPendientesDeRenovar,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cargandoPara) return
      const montoCentavos = parseMontoEsArACentavos(montoTexto)
      if (!numero.trim() || !fechaPago || montoCentavos == null || montoCentavos <= 0) {
        throw new Error('Completá número, fecha de pago y monto del cheque nuevo')
      }
      await confirmarRenovacionCheques([...cargandoPara], {
        numero: numero.trim(),
        bancoEmisor: bancoEmisor.trim() || null,
        fechaPago,
        montoCentavos,
        destinatario: destinatario.trim() || null,
      })
    },
    onSuccess: async () => {
      toast.success('Renovación confirmada')
      setCargandoPara(null)
      setSeleccionados(new Set())
      setNumero('')
      setBancoEmisor('')
      setFechaPago('')
      setMontoTexto('')
      setDestinatario('')
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'hoy'] })
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'compromisos-mes'] })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo confirmar la renovación')
    },
  })

  const pendientes = data ?? []

  function toggle(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function iniciarCarga(ids: Set<string>) {
    if (ids.size === 0) return
    setCargandoPara(ids)
  }

  if (isLoading) return <p className="text-body-muted text-sm">Cargando pendientes de renovar…</p>
  if (pendientes.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <h3 className="text-heading text-[15px] font-semibold">
        Pendientes de renovar ({pendientes.length})
      </h3>
      <p className="text-body-muted mt-1 text-[13px]">
        Estos cheques no se pagan: alguien dijo "Renovar" en Hoy. Cargá acá el cheque nuevo que los
        reemplaza. Si varios se juntan en un solo cheque nuevo, elegilos a todos antes de cargar.
      </p>
      <div className="mt-3 grid gap-2">
        {pendientes.map((cheque: ChequePendienteDeRenovar) => (
          <label
            key={cheque.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[14px] dark:border-amber-900/50 dark:bg-zinc-900"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={seleccionados.has(cheque.id)}
                onChange={() => toggle(cheque.id)}
              />
              <span>
                <span className="text-heading font-medium">
                  Cheque Nº {cheque.numero} — {cheque.destinatario ?? cheque.emisor}
                </span>
                <span className="text-body-muted block text-[12px]">
                  Vencía el {fechaCorta(cheque.fechaPago)}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{formatMoneyCentavos(cheque.montoCentavos, 'ARS')}</span>
              <button
                type="button"
                className="rounded-lg bg-brand-primary px-2.5 py-1 text-[13px] font-medium text-white hover:opacity-90"
                onClick={() => iniciarCarga(new Set([cheque.id]))}
              >
                Cargar el que lo reemplaza
              </button>
            </span>
          </label>
        ))}
      </div>
      {seleccionados.size > 1 ? (
        <button
          type="button"
          className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-[13px] font-medium text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
          onClick={() => iniciarCarga(seleccionados)}
        >
          Renovar los {seleccionados.size} seleccionados juntos
        </button>
      ) : null}

      {cargandoPara ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-heading text-[14px] font-medium">
            Cheque nuevo que reemplaza a {cargandoPara.size === 1 ? 'este cheque' : `estos ${cargandoPara.size} cheques`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FinanzasFormField label="Número de cheque" htmlFor="renov-numero">
              <input id="renov-numero" className={finanzasInputClass} value={numero} onChange={(e) => setNumero(e.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Banco" htmlFor="renov-banco" optional>
              <input id="renov-banco" className={finanzasInputClass} value={bancoEmisor} onChange={(e) => setBancoEmisor(e.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Fecha de pago" htmlFor="renov-fecha">
              <input id="renov-fecha" type="date" className={finanzasInputClass} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </FinanzasFormField>
            <FinanzasFormField label="Monto" htmlFor="renov-monto">
              <input id="renov-monto" className={finanzasInputClass} value={montoTexto} onChange={(e) => setMontoTexto(e.target.value)} placeholder="0,00" />
            </FinanzasFormField>
            <FinanzasFormField label="A nombre de quién" htmlFor="renov-destinatario" optional>
              <input id="renov-destinatario" className={finanzasInputClass} value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
            </FinanzasFormField>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800"
              onClick={() => setCargandoPara(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Confirmando…' : 'Confirmar renovación'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
