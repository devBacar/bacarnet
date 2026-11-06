import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lightbulb } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  clasificarOcasional,
  type ChequeOcasionalItem,
  type DatosOperacionManual,
  type OcasionalDetalleResponse,
  type PropuestaRenovacionItem,
  type RolOperacion,
  type TipoOperacionManual,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { ArmarRenovacion } from './ArmarRenovacion'

const TIPOS: [TipoOperacionManual, string][] = [
  ['usd', 'Dólares'],
  ['renovacion', 'Renovación'],
  ['rol', 'Interés / capital'],
]

const ROLES: [RolOperacion, string][] = [
  ['capital', 'Capital'],
  ['interes', 'Interés'],
  ['mixto', 'Capital + interés'],
]

const ETIQUETA_TIPO: Record<TipoOperacionManual, string> = {
  usd: 'operación en dólares',
  renovacion: 'renovación',
  rol: 'interés / capital',
}

const formatoNumero = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** "65.000" → 65000, "1.435,50" → 1435.5 (formato argentino). */
function leerNumero(texto: string): number {
  return Number(texto.trim().replace(/\./g, '').replace(',', '.'))
}

function textoSugerencia(s: NonNullable<ChequeOcasionalItem['sugerencia']>): string {
  const casos = s.confirmaciones === 1 ? '1 caso confirmado' : `${s.confirmaciones} casos confirmados`
  let detalle = ''
  if (s.datos.usd) detalle = `: US$ ${formatoNumero(s.datos.usd.montoUsd)} a TC ${formatoNumero(s.datos.usd.cotizacion)}`
  else if (s.datos.rol) detalle = `: ${ROLES.find(([v]) => v === s.datos.rol)?.[1] ?? s.datos.rol}`
  else if (s.datos.chequeIds?.length) detalle = ` de ${s.datos.chequeIds.join(', ')}`
  return `Parece ${ETIQUETA_TIPO[s.tipo]}${detalle} (${casos} de este beneficiario con el mismo OBS).`
}

/**
 * Marca a mano el tipo de operación de un cheque ocasional cuando el OBS no alcanza. Lo que se confirma acá
 * se aprende: los cheques que lleguen con el mismo formato de OBS van a traer la sugerencia lista.
 */
export function ClasificarOperacionPanel({
  id,
  cheque,
  lecturaObs,
  mismaOperacion,
  propuestaRenovacion,
}: {
  id: string
  cheque: ChequeOcasionalItem
  lecturaObs: OcasionalDetalleResponse['lecturaObs']
  mismaOperacion: number
  propuestaRenovacion?: PropuestaRenovacionItem
}) {
  const queryClient = useQueryClient()
  const sugerencia = cheque.sugerencia ?? null
  const usdInicial = sugerencia?.datos.usd ?? lecturaObs?.usd ?? null
  const idsIniciales = sugerencia?.datos.chequeIds ?? lecturaObs?.numerosDeCheque ?? []

  const [tipo, setTipo] = useState<TipoOperacionManual>(sugerencia?.tipo ?? (lecturaObs?.usd ? 'usd' : 'rol'))
  const [montoUsd, setMontoUsd] = useState(usdInicial ? formatoNumero(usdInicial.montoUsd) : '')
  const [cotizacion, setCotizacion] = useState(usdInicial ? formatoNumero(usdInicial.cotizacion) : '')
  const [chequeIds, setChequeIds] = useState(idsIniciales.join(', '))
  const [rol, setRol] = useState<RolOperacion>(sugerencia?.datos.rol ?? 'interes')
  const otros = Math.max(0, mismaOperacion - 1)
  const [aplicarAIguales, setAplicarAIguales] = useState(true)

  const guardar = useMutation({
    mutationFn: (v: { tipo: TipoOperacionManual; datos: DatosOperacionManual; chequesDelGrupo?: string[] }) =>
      clasificarOcasional(id, v.tipo, v.datos, aplicarAIguales, v.chequesDelGrupo),
    onSuccess: (r) => {
      const cuantos = r.cheques === 1 ? '1 cheque' : `${r.cheques} cheques`
      toast.success(`Guardado como ${ETIQUETA_TIPO[r.tipo]} en ${cuantos}. Lo aprendido para este OBS: ${r.confirmaciones} ${r.confirmaciones === 1 ? 'vez' : 'veces'}.`)
      if (!r.recalculado) toast.error('Se guardó, pero falta recalcular: tocá "Recalcular todo".')
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
  })

  const enviar = () => {
    if (tipo === 'usd') {
      guardar.mutate({ tipo, datos: { usd: { montoUsd: leerNumero(montoUsd), cotizacion: leerNumero(cotizacion) } } })
    } else if (tipo === 'renovacion') {
      const ids = chequeIds.split(/[\s,;/]+/).map((x) => x.trim()).filter(Boolean)
      guardar.mutate({ tipo, datos: { chequeIds: ids } })
    } else {
      guardar.mutate({ tipo, datos: { rol } })
    }
  }

  const armarRenovacion = tipo === 'renovacion' && propuestaRenovacion != null

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 p-3 text-sm dark:border-zinc-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">¿Qué operación es?</p>
      <p className="mt-1 text-xs text-body-muted">
        El OBS no alcanza para saberlo. Lo que marques acá se aprende para los próximos cheques de este beneficiario con el mismo OBS.
      </p>

      {sugerencia ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
          <Lightbulb className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{textoSugerencia(sugerencia)}</span>
          <button
            type="button"
            disabled={guardar.isPending || (sugerencia.tipo === 'renovacion' && !sugerencia.datos.chequeIds?.length)}
            onClick={() => guardar.mutate({ tipo: sugerencia.tipo, datos: sugerencia.datos })}
            className="rounded-md border border-sky-300 bg-white px-2 py-1 font-semibold hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-zinc-900"
          >
            Aceptar sugerencia
          </button>
        </div>
      ) : null}

      <div className="mt-3 inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
        {TIPOS.map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setTipo(val)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tipo === val ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {armarRenovacion ? (
        <ArmarRenovacion
          numeroAbierto={cheque.numeroCheque}
          obs={cheque.obsOriginal}
          propuesta={propuestaRenovacion}
          guardando={guardar.isPending}
          onGuardar={(ids, chequesDelGrupo) => guardar.mutate({ tipo: 'renovacion', datos: { chequeIds: ids }, chequesDelGrupo })}
        />
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {tipo === 'usd' ? (
              <>
                <label className="text-xs">
                  <span className="text-body-muted">Dólares pedidos</span>
                  <input className={`${finanzasInputClass} mt-0.5 w-36`} inputMode="decimal" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} />
                </label>
                <label className="text-xs">
                  <span className="text-body-muted">Cotización (TC)</span>
                  <input className={`${finanzasInputClass} mt-0.5 w-28`} inputMode="decimal" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} />
                </label>
              </>
            ) : tipo === 'renovacion' ? (
              <label className="min-w-0 flex-1 text-xs">
                <span className="text-body-muted">Cheques que renueva (números, separados por coma)</span>
                <input className={`${finanzasInputClass} mt-0.5 w-full`} value={chequeIds} placeholder="39111588, 39111589" onChange={(e) => setChequeIds(e.target.value)} />
              </label>
            ) : (
              <label className="text-xs">
                <span className="text-body-muted">Este cheque es</span>
                <select className={`${finanzasInputClass} mt-0.5 w-44`} value={rol} onChange={(e) => setRol(e.target.value as RolOperacion)}>
                  {ROLES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {otros > 0 ? (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={aplicarAIguales} onChange={(e) => setAplicarAIguales(e.target.checked)} />
              Aplicar también a {otros === 1 ? 'el otro cheque' : `los otros ${otros} cheques`} de {cheque.beneficiario || 'este beneficiario'} emitidos el mismo día con el mismo OBS
            </label>
          ) : null}

          <button
            type="button"
            disabled={guardar.isPending}
            onClick={enviar}
            className="mt-2 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      )}
    </div>
  )
}
