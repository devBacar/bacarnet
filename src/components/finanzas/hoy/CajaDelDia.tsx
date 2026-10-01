import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  fetchCajaDia,
  fetchDetallesCaja,
  guardarDetalleCaja,
  type CajaDiaResponse,
  type LineaCajaDia,
} from '../../../services/finanzasCajaDiaApi'
import { formatMoneyCentavos } from '../formatMoney'
import { Ayuda, linkChico } from './TarjetasHoy'
import { FilaBanco } from './cajaDelDia/FilaBanco'
import { esFechaId, hoyArgentina, limitesCaja, moverDiaHabil, tituloDiaCorto, ultimoDiaHabil } from './cajaDelDia/fechasCaja'

const control =
  'inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white p-1 text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

/** Cuadrito chico con un monto completo y un link a su pestaña. */
function Cuadrito({ titulo, monto, href, pestania }: { titulo: string; monto: string; href: string; pestania: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-neutral-50 px-2.5 py-2 dark:bg-zinc-800/60">
      <p className="text-body-muted text-xs">{titulo}</p>
      <p className="text-heading break-words text-sm font-medium tabular-nums">{monto}</p>
      <Link to={href} className={linkChico}>
        {pestania} ›
      </Link>
    </div>
  )
}

function Cuadritos({ data }: { data: CajaDiaResponse }) {
  const cheques = data.cheques.saldoCentavos + data.echeq.saldoCentavos
  const cantidadCheques = (data.cheques.cantidadEnCartera ?? 0) + (data.echeq.cantidadEnCartera ?? 0)
  const dolares = data.dolares.reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0)
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Cuadrito titulo="Efectivo en cajas" monto={formatMoneyCentavos(data.efectivo.saldoCentavos, 'ARS')} href="/finanzas/cajas" pestania="Cajas" />
      <Cuadrito
        titulo={`Cheques en cartera${cantidadCheques > 0 ? ` (${cantidadCheques})` : ''}`}
        monto={formatMoneyCentavos(cheques, 'ARS')}
        href="/finanzas/cheques"
        pestania="Cheques"
      />
      <Cuadrito
        titulo="Dólares"
        monto={data.dolares.length === 0 ? 'Sin cuentas en dólares' : formatMoneyCentavos(dolares, 'USD')}
        href="/finanzas/cuentas"
        pestania="Saldos"
      />
    </div>
  )
}

export function CajaDelDia({ fecha }: { fecha?: string }) {
  const hoy = hoyArgentina()
  const { minimo, maximo } = limitesCaja(hoy)
  const inicial = fecha && esFechaId(fecha) ? fecha : ultimoDiaHabil(hoy)
  const [dia, setDia] = useState(inicial)
  const [bancoAbierto, setBancoAbierto] = useState<string | null>(null)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (fecha && esFechaId(fecha)) setDia(fecha)
  }, [fecha])

  const caja = useQuery({
    queryKey: ['finanzas', 'caja-dia', dia],
    queryFn: () => fetchCajaDia(dia),
  })
  const detalles = useQuery({
    queryKey: ['finanzas', 'detalles-caja'],
    queryFn: fetchDetallesCaja,
    staleTime: 60_000,
  })

  const guardar = useMutation({
    mutationFn: async (input: { linea: LineaCajaDia; texto: string | null; aplicar: boolean }) => {
      const ids = input.linea.movimientoIds
      if (ids.length === 0) return
      if (input.aplicar && input.linea.textoBanco) {
        await guardarDetalleCaja(ids[0], { detalleCaja: input.texto, aplicarAlMismoTexto: true })
        return
      }
      const lote = 8
      for (let i = 0; i < ids.length; i += lote) {
        const slice = ids.slice(i, i + lote)
        await Promise.all(
          slice.map((id) =>
            guardarDetalleCaja(id, { detalleCaja: input.texto, aplicarAlMismoTexto: input.aplicar }),
          ),
        )
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'caja-dia'] })
      await queryClient.invalidateQueries({ queryKey: ['finanzas', 'detalles-caja'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el detalle')
    },
    onSettled: () => setGuardandoId(null),
  })

  const anterior = moverDiaHabil(dia, -1, minimo, maximo)
  const siguiente = moverDiaHabil(dia, 1, minimo, maximo)
  const data = caja.data

  return (
    <section className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-heading text-sm font-medium">Caja del día · {tituloDiaCorto(dia)}</h2>
          <p className="text-body-muted text-xs">Lo que entró y salió de cada banco.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Día anterior" disabled={!anterior} onClick={() => anterior && setDia(anterior)} className={control}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Día siguiente" disabled={!siguiente} onClick={() => siguiente && setDia(siguiente)} className={control}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {caja.isLoading ? (
        <p className="text-body-muted py-3 text-xs">Cargando la caja…</p>
      ) : caja.isError ? (
        <p className="py-3 text-xs text-red-700 dark:text-red-300">
          {caja.error instanceof Error ? caja.error.message : 'No se pudo armar la caja del día'}
        </p>
      ) : data ? (
        <>
          {data.bancos.length === 0 ? (
            <p className="text-body-muted py-3 text-xs">No hay cuentas corrientes en pesos.</p>
          ) : (
            <ul className="mt-1 divide-y divide-neutral-100 dark:divide-zinc-800">
              {data.bancos.map((banco) => (
                <FilaBanco
                  key={banco.cuentaId}
                  banco={banco}
                  fecha={data.fecha}
                  detalles={detalles.data ?? []}
                  guardandoId={guardandoId}
                  abierto={bancoAbierto === banco.cuentaId}
                  onToggle={() => setBancoAbierto((actual) => (actual === banco.cuentaId ? null : banco.cuentaId))}
                  onGuardar={(linea, texto, aplicar) => {
                    setGuardandoId(`${banco.cuentaId}:${linea.detalle}:${linea.centavos < 0 ? '-' : '+'}`)
                    guardar.mutate({ linea, texto, aplicar })
                  }}
                />
              ))}
            </ul>
          )}
          <Cuadritos data={data} />
        </>
      ) : null}
      <Ayuda>«Ver» muestra el detalle de cada banco. La palabra de cada línea la cambiás acá y queda guardada.</Ayuda>
    </section>
  )
}
