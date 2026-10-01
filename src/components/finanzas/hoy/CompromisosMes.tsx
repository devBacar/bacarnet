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
import { hoyArgentina } from './cajaDelDia/fechasCaja'
import { COMPROMISO_VACIO } from './compromisosMes/compromisoVacio'
import { FormularioCompromiso } from './compromisosMes/FormularioCompromiso'
import { LeyendaPlanilla } from './compromisosMes/planillaComun'
import { PlanillaCompromisos } from './compromisosMes/PlanillaCompromisos'
import { PlanillaPorSemana } from './compromisosMes/PlanillaPorSemana'
import { botonChico } from './TarjetasHoy'

const CLAVE_VISTA = 'bacarnet.planilla-mes.vista'
type VistaPlanilla = 'semana' | 'dia'

const control =
  'inline-flex items-center justify-center rounded-md border border-[var(--color-primary-muted)] bg-white/80 p-1 text-[var(--color-primary)] hover:bg-white dark:bg-zinc-900/60 dark:hover:bg-zinc-800'

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

function nombreMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, numero - 1, 1)))
}

function etiquetaMes(mes: string): string {
  const [anio] = mes.split('-').map(Number)
  return `${nombreMes(mes)} ${anio}`
}

function vistaGuardada(): VistaPlanilla {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'dia' ? 'dia' : 'semana'
  } catch {
    return 'semana'
  }
}

function guardarVista(vista: VistaPlanilla) {
  try {
    localStorage.setItem(CLAVE_VISTA, vista)
  } catch {
    // el navegador puede bloquear el almacenamiento
  }
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

export function CompromisosMes({ onPagar }: { onPagar: (compromisoId: string) => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [mes, setMes] = useState(mesActual)
  const [vista, setVista] = useState<VistaPlanilla>(vistaGuardada)
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
      inicial: { ...COMPROMISO_VACIO, grupo, fechaVencimiento: `${mes}-01` },
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

  const elegirVista = (siguiente: VistaPlanilla) => {
    setVista(siguiente)
    guardarVista(siguiente)
  }

  const tipoCambio = planilla.data?.tipoCambio ?? null
  const nombre = etiquetaMes(mes)
  const mesPrevio = nombreMes(moverMes(mes, -1))
  const hoy = hoyArgentina()

  return (
    <section className="min-w-0 max-w-full rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--color-primary-muted)] bg-[var(--color-primary-light)] px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-medium text-[var(--color-primary)]">Compromisos de</h2>
          <div className="inline-flex items-center gap-1">
            <button type="button" className={control} aria-label="Mes anterior" onClick={() => setMes((actual) => moverMes(actual, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-32 text-center text-[15px] font-medium text-[var(--color-primary)]">{nombre}</span>
            <button type="button" className={control} aria-label="Mes siguiente" onClick={() => setMes((actual) => moverMes(actual, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Cómo ver el mes" className="inline-flex rounded-lg border border-[var(--color-primary-muted)] bg-white/60 p-0.5 dark:bg-zinc-900/40">
            {(
              [
                ['semana', 'Por semana'],
                ['dia', 'Por día'],
              ] as const
            ).map(([opcion, texto]) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={vista === opcion}
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${vista === opcion ? 'bg-white text-[var(--color-primary)] shadow-sm dark:bg-zinc-900' : 'text-[var(--color-primary)]'}`}
                onClick={() => elegirVista(opcion)}
              >
                {texto}
              </button>
            ))}
          </div>
          {editandoTc ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[13px] text-[var(--color-primary)]" htmlFor="mes-tc">
                Dólar del mes
              </label>
              <input
                id="mes-tc"
                inputMode="decimal"
                className="w-28 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[15px] tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                value={tcTexto}
                onChange={(event) => setTcTexto(event.target.value)}
              />
              <button type="button" className="text-[13px] font-medium text-[var(--color-primary)]" disabled={guardandoTc} onClick={guardarTc}>
                {guardandoTc ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="text-[13px] text-[var(--color-primary)]" onClick={() => setEditandoTc(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--color-primary)]">
              Dólar del mes:{' '}
              {tipoCambio == null ? (
                <span>sin cargar</span>
              ) : (
                <span className="text-[15px] font-medium tabular-nums">$ {textoTipoCambio(tipoCambio)}</span>
              )}
              <button
                type="button"
                className="ml-2 text-[13px] font-medium underline-offset-2 hover:underline"
                onClick={() => {
                  setTcTexto(tipoCambio == null ? '' : textoTipoCambio(tipoCambio))
                  setEditandoTc(true)
                }}
              >
                {tipoCambio == null ? 'Cargar' : 'Cambiar'}
              </button>
            </p>
          )}
          <button type="button" className={`${botonChico} gap-1`} onClick={() => abrirAlta('Otros egresos')}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        </div>
      </header>
      {planilla.isLoading ? <p className="text-body-muted px-3 py-6 text-[15px]">Cargando la planilla…</p> : null}
      {planilla.isError ? (
        <p className="px-3 py-6 text-[15px] text-red-600 dark:text-red-400">
          {planilla.error instanceof Error ? planilla.error.message : 'No se pudo cargar la planilla'}
        </p>
      ) : null}
      {planilla.data ? (
        <>
          <LeyendaPlanilla />
          {vista === 'semana' ? (
            <PlanillaPorSemana
              key={mes}
              planilla={planilla.data}
              hoy={hoy}
              mesAnterior={mesPrevio}
              onPagar={onPagar}
              onEditar={abrirEdicion}
              onAgregar={abrirAlta}
            />
          ) : (
            <PlanillaCompromisos
              key={mes}
              planilla={planilla.data}
              hoy={hoy}
              mesAnterior={mesPrevio}
              onPagar={onPagar}
              onEditar={abrirEdicion}
              onAgregar={abrirAlta}
            />
          )}
        </>
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
