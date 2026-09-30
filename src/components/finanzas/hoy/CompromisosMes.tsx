import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context'
import {
  COMPROMISOS_MES_QUERY_KEY,
  crearCompromisoMes,
  editarCompromisoMes,
  fetchPlanillaCompromisosMes,
  guardarTipoCambioMes,
  GRUPOS_COMPROMISO,
  type CompromisoMesInput,
  type FilaCompromisoMes,
} from '../../../services/finanzasCompromisosMesApi'
import { FormularioCompromiso } from './compromisosMes/FormularioCompromiso'
import { PlanillaCompromisos } from './compromisosMes/PlanillaCompromisos'

function mesActual(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

function moverMes(mes: string, delta: number): string {
  const [anio, numero] = mes.split('-').map(Number)
  const date = new Date(Date.UTC(anio, numero - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const nombre = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(anio, numero - 1, 1)),
  )
  return `${nombre} ${anio}`
}

function parseTipoCambio(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace(/^\$/, '')
  if (!/^\d{1,3}(\.\d{3})+(,\d{1,4})?$/.test(trimmed) && !/^\d+(,\d{1,4})?$/.test(trimmed)) return null
  const value = Number(trimmed.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function textoTipoCambio(valor: number): string {
  return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const VACIO: CompromisoMesInput = {
  concepto: '',
  proveedorONombre: '',
  grupo: 'Otros egresos',
  moneda: 'ARS',
  montoCentavos: 0,
  fechaVencimiento: '',
  deudaTotalCentavos: null,
  cuotaNumero: null,
  cuotaTotal: null,
  observacion: null,
  medioPago: 'transferencia',
}

export function CompromisosMes({ onPagar }: { onPagar: (compromisoId: string) => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [mes, setMes] = useState(mesActual)
  const [formulario, setFormulario] = useState<
    null | { modo: 'alta'; inicial: CompromisoMesInput } | { modo: 'editar'; id: string; inicial: CompromisoMesInput }
  >(null)
  const [editandoTc, setEditandoTc] = useState(false)
  const [tcTexto, setTcTexto] = useState('')
  const [guardandoTc, setGuardandoTc] = useState(false)

  const planilla = useQuery({
    queryKey: [...COMPROMISOS_MES_QUERY_KEY, mes],
    queryFn: () => fetchPlanillaCompromisosMes(mes),
    enabled: Boolean(user),
  })

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'agenda'] })
  }

  const abrirAlta = (grupo: string) => {
    setFormulario({
      modo: 'alta',
      inicial: { ...VACIO, grupo, fechaVencimiento: `${mes}-01` },
    })
  }

  const abrirEdicion = (fila: FilaCompromisoMes) => {
    setFormulario({
      modo: 'editar',
      id: fila.compromisoId,
      inicial: {
        concepto: fila.concepto,
        proveedorONombre: fila.proveedorONombre,
        grupo: planilla.data?.grupos.find((grupo) => grupo.filas.some((item) => item.compromisoId === fila.compromisoId))
          ?.grupo ?? 'Otros egresos',
        moneda: fila.moneda,
        montoCentavos: fila.importeCentavos,
        fechaVencimiento: fila.fechaVencimiento,
        deudaTotalCentavos: fila.deudaTotalCentavos,
        cuotaNumero: fila.cuotaNumero,
        cuotaTotal: fila.cuotaTotal,
        observacion: fila.observacion,
        medioPago: fila.medioPago,
      },
    })
  }

  const guardarTc = () => {
    const usdArs = parseTipoCambio(tcTexto)
    if (usdArs == null) {
      toast.error('El tipo de cambio no es válido')
      return
    }
    setGuardandoTc(true)
    void guardarTipoCambioMes(mes, usdArs)
      .then(() => {
        toast.success('Tipo de cambio guardado')
        setEditandoTc(false)
        recargar()
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar el tipo de cambio')
      })
      .finally(() => setGuardandoTc(false))
  }

  const tipoCambio = planilla.data?.tipoCambio ?? null
  const nombreMes = etiquetaMes(mes)

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-3 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-heading text-sm font-semibold">Compromisos de</h2>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg border border-neutral-200 p-1 dark:border-zinc-700"
              aria-label="Mes anterior"
              onClick={() => setMes((actual) => moverMes(actual, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-32 text-center text-sm">{nombreMes}</span>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 p-1 dark:border-zinc-700"
              aria-label="Mes siguiente"
              onClick={() => setMes((actual) => moverMes(actual, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {editandoTc ? (
            <div className="flex items-center gap-2">
              <label className="text-xs" htmlFor="mes-tc">
                TC USD
              </label>
              <input
                id="mes-tc"
                inputMode="decimal"
                className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                value={tcTexto}
                onChange={(event) => setTcTexto(event.target.value)}
              />
              <button type="button" className="text-xs font-medium text-brand-primary" disabled={guardandoTc} onClick={guardarTc}>
                {guardandoTc ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="text-xs" onClick={() => setEditandoTc(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <p className="text-sm tabular-nums">
              TC USD:{' '}
              {tipoCambio == null ? (
                <span className="text-body-muted">sin cargar</span>
              ) : (
                <span>$ {textoTipoCambio(tipoCambio)}</span>
              )}
              <button
                type="button"
                className="ml-2 text-xs font-medium text-brand-primary"
                onClick={() => {
                  setTcTexto(tipoCambio == null ? '' : textoTipoCambio(tipoCambio))
                  setEditandoTc(true)
                }}
              >
                {tipoCambio == null ? 'Cargar' : 'Cambiar'}
              </button>
            </p>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white"
            onClick={() => abrirAlta('Otros egresos')}
          >
            <Plus className="h-4 w-4" />
            Agregar compromiso
          </button>
        </div>
      </header>
      {planilla.isLoading ? <p className="text-body-muted px-3 py-6 text-sm">Cargando la planilla…</p> : null}
      {planilla.isError ? (
        <p className="px-3 py-6 text-sm text-red-600 dark:text-red-400">
          {planilla.error instanceof Error ? planilla.error.message : 'No se pudo cargar la planilla'}
        </p>
      ) : null}
      {planilla.data ? (
        <PlanillaCompromisos
          key={mes}
          planilla={planilla.data}
          onPagar={onPagar}
          onEditar={abrirEdicion}
          onAgregar={abrirAlta}
        />
      ) : null}
      {formulario ? (
        <FormularioCompromiso
          titulo={formulario.modo === 'alta' ? 'Nuevo compromiso' : 'Editar compromiso'}
          grupos={planilla.data?.grupos.map((grupo) => grupo.grupo) ?? [...GRUPOS_COMPROMISO]}
          inicial={formulario.inicial}
          onClose={() => setFormulario(null)}
          onSave={async (body) => {
            if (formulario.modo === 'editar') await editarCompromisoMes(formulario.id, body)
            else await crearCompromisoMes(body)
            toast.success(formulario.modo === 'alta' ? 'Compromiso cargado' : 'Compromiso actualizado')
            setFormulario(null)
            recargar()
          }}
        />
      ) : null}
    </section>
  )
}
