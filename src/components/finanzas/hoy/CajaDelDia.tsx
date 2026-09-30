import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchCajaDia,
  fetchDetallesCaja,
  guardarDetalleCaja,
  type BancoCajaDia,
  type LineaCajaDia,
} from '../../../services/finanzasCajaDiaApi'
import { formatMoneyCentavos } from '../formatMoney'
import { Monto } from './TarjetasHoy'
import {
  esFechaId,
  etiquetaBanco,
  hoyArgentina,
  limitesCaja,
  moverDiaHabil,
  tituloDia,
  ultimoDiaHabil,
} from './cajaDelDia/fechasCaja'
import { FilaMonto, LineaBanco, LineasSimples, Planilla } from './cajaDelDia/PlanillaCaja'

const control =
  'inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800'

function avisoCuadre(banco: BancoCajaDia): { texto: string; centavos: number } | null {
  const diferencia = banco.cuadre.diferenciaCentavos
  if (diferencia == null || diferencia === 0) return null
  if (diferencia === banco.faltanteCentavos && banco.faltanteCentavos !== 0) return null
  if (banco.cuadre.esRedondeo) return { texto: 'Diferencia de redondeo', centavos: diferencia }
  return { texto: 'No cierra', centavos: diferencia }
}

function ColumnaBanco({
  banco,
  fecha,
  detalles,
  guardandoId,
  onGuardar,
}: {
  banco: BancoCajaDia
  fecha: string
  detalles: Awaited<ReturnType<typeof fetchDetallesCaja>>
  guardandoId: string | null
  onGuardar: (linea: LineaCajaDia, texto: string | null, aplicar: boolean) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const aviso = avisoCuadre(banco)
  const clave = (linea: LineaCajaDia) => `${banco.cuentaId}:${linea.detalle}:${linea.centavos < 0 ? '-' : '+'}`

  return (
    <Planilla
      titulo={etiquetaBanco(banco.bancoNombre)}
      nota={banco.origenSaldo === 'cierre15' ? 'Cierre de las 15 hs' : undefined}
    >
      <FilaMonto
        texto="Arranca"
        centavos={banco.arrancaCentavos}
        className="bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-gray-300"
      />
      {banco.lineas.length === 0 ? (
        <p className="text-body-muted px-2.5 py-1 text-xs">Sin movimientos</p>
      ) : (
        banco.lineas.map((linea) => (
          <LineaBanco
            key={clave(linea)}
            linea={linea}
            fecha={fecha}
            cuentaId={banco.cuentaId}
            abierta={abierta === clave(linea)}
            detalles={detalles}
            guardando={guardandoId === clave(linea)}
            onAbrir={() => setAbierta(clave(linea))}
            onCerrar={() => setAbierta(null)}
            onElegir={(texto, aplicar) => {
              setAbierta(null)
              onGuardar(linea, texto, aplicar)
            }}
          />
        ))
      )}
      <FilaMonto texto="Saldo" centavos={banco.saldoCentavos} className="text-heading border-t border-neutral-200 font-semibold dark:border-zinc-700" />
      <div className="flex min-w-0 items-center justify-between gap-2 px-2.5 py-1 text-sm">
        <span className="text-body-muted min-w-0 truncate text-xs">Descubierto</span>
        {banco.descubiertoCentavos == null ? (
          <span className="text-body-muted shrink-0 text-xs">Sin acuerdo</span>
        ) : (
          <Monto centavos={banco.descubiertoCentavos} negativoEnRojo={false} className="shrink-0" />
        )}
      </div>
      {banco.faltanteCentavos !== 0 ? (
        <div className="flex min-w-0 items-center justify-between gap-2 bg-amber-50 px-2.5 py-1 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="min-w-0">Sin detalle todavía</span>
          <Monto centavos={banco.faltanteCentavos} className="shrink-0" />
        </div>
      ) : null}
      {aviso ? (
        <p className="text-body-muted flex min-w-0 items-center justify-between gap-2 px-2.5 py-1 text-xs">
          <span className="min-w-0">{aviso.texto}</span>
          <span className="shrink-0 tabular-nums">{formatMoneyCentavos(aviso.centavos, 'ARS')}</span>
        </p>
      ) : null}
    </Planilla>
  )
}

export function CajaDelDia({ fecha }: { fecha?: string }) {
  const hoy = hoyArgentina()
  const { minimo, maximo } = limitesCaja(hoy)
  const inicial = fecha && esFechaId(fecha) ? fecha : ultimoDiaHabil(hoy)
  const [dia, setDia] = useState(inicial)
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
    <section className="surface-card min-w-0 rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-zinc-800">
        <h2 className="text-heading min-w-0 text-sm font-semibold">Caja del día · {tituloDia(dia)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Día anterior"
            disabled={!anterior}
            onClick={() => anterior && setDia(anterior)}
            className={`${control} p-1.5`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Día siguiente"
            disabled={!siguiente}
            onClick={() => siguiente && setDia(siguiente)}
            className={`${control} p-1.5`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {caja.isLoading ? (
        <p className="text-body-muted px-3 py-3 text-xs">Cargando la caja…</p>
      ) : caja.isError ? (
        <p className="px-3 py-3 text-xs text-red-700 dark:text-red-300">
          {caja.error instanceof Error ? caja.error.message : 'No se pudo armar la caja del día'}
        </p>
      ) : data ? (
        <div className="min-w-0 space-y-3 p-3">
          {data.bancos.length === 0 ? (
            <p className="text-body-muted text-xs">No hay cuentas corrientes en pesos.</p>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
              {data.bancos.map((banco) => (
                <ColumnaBanco
                  key={banco.cuentaId}
                  banco={banco}
                  fecha={data.fecha}
                  detalles={detalles.data ?? []}
                  guardandoId={guardandoId}
                  onGuardar={(linea, texto, aplicar) => {
                    setGuardandoId(`${banco.cuentaId}:${linea.detalle}:${linea.centavos < 0 ? '-' : '+'}`)
                    guardar.mutate({ linea, texto, aplicar })
                  }}
                />
              ))}
            </div>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
            <Planilla titulo="Efectivo">
              <FilaMonto
                texto="Arranca"
                centavos={data.efectivo.arrancaCentavos}
                className="bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-gray-300"
              />
              <LineasSimples lineas={data.efectivo.lineas} />
              <FilaMonto
                texto="Saldo"
                centavos={data.efectivo.saldoCentavos}
                className="text-heading border-t border-neutral-200 font-semibold dark:border-zinc-700"
              />
            </Planilla>

            <Planilla titulo="Cheques y Echeq">
              <p className="text-heading px-2.5 pt-1 text-xs font-medium">Cheques</p>
              <FilaMonto texto="En cartera" centavos={data.cheques.saldoCentavos} />
              <LineasSimples lineas={data.cheques.lineas} />
              <p className="text-heading border-t border-neutral-200 px-2.5 pt-1 text-xs font-medium dark:border-zinc-700">
                Echeq
              </p>
              <FilaMonto texto="En cartera" centavos={data.echeq.saldoCentavos} />
              <LineasSimples lineas={data.echeq.lineas} />
            </Planilla>

            <Planilla titulo="Dólares y fondos" nota="Saldo cargado a mano">
              {data.dolares.length === 0 ? (
                <p className="text-body-muted px-2.5 py-1 text-xs">Sin cuentas en dólares</p>
              ) : (
                data.dolares.map((cuenta) => (
                  <FilaMonto
                    key={cuenta.cuentaId}
                    texto={etiquetaBanco(cuenta.bancoNombre)}
                    centavos={cuenta.saldoCentavos}
                    moneda="USD"
                  />
                ))
              )}
              {data.fondos.length === 0 ? (
                <p className="text-body-muted px-2.5 py-1 text-xs">Sin datos de fondos</p>
              ) : (
                data.fondos.map((fondo) => (
                  <FilaMonto key={fondo.nombre} texto={fondo.nombre} centavos={fondo.saldoCentavos} />
                ))
              )}
            </Planilla>
          </div>
        </div>
      ) : null}
    </section>
  )
}
