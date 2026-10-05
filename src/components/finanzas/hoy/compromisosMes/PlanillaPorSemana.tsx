import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatMoneyCentavos } from '../../formatMoney'
import { montoCorto } from '../montoCorto'
import { usePermisosFinanzas } from '../../permisosFinanzas'
import { botonChico, botonChicoSecundario } from '../TarjetasHoy'
import type {
  FilaCompromisoMes,
  GrupoCompromisoMes,
  PlanillaCompromisosMes,
} from '../../../../services/finanzasCompromisosMesApi'
import {
  BotonAgregar,
  ConceptoFila,
  LineasPagosHechos,
  MontoUno,
  MontosEnLineas,
  NombreGrupo,
  PieGruposVacios,
} from './planillaComun'
import {
  GRILLA,
  claseTono,
  detalleCompromiso,
  estaPago,
  montosVacios,
  puedePagarFila,
  sumarCampo,
  textoEstado,
  tonoFalta,
  useGruposPlanilla,
} from './planillaModelo'
import {
  etiquetaRango,
  montosPlanificados,
  sumaEnSemana,
  textoDia,
  tonoSemana,
  semanasDelMes,
  type SemanaDelMes,
} from './semanasDelMes'

const FONDO = 'bg-white dark:bg-zinc-900'
const FONDO_HEAD = 'bg-neutral-50 dark:bg-zinc-950'
const FONDO_GRUPO = 'bg-neutral-100 dark:bg-zinc-800'
const FONDO_TOTAL = 'bg-neutral-200 dark:bg-zinc-800'
const FONDO_HOY = 'bg-sky-50 dark:bg-sky-950'
const FONDO_HOY_HOVER = 'bg-sky-50 group-hover:bg-sky-100 dark:bg-sky-950 dark:group-hover:bg-sky-900'
const FONDO_FILA = 'bg-white group-hover:bg-neutral-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'

function fondoSemana(contieneHoy: boolean, base: string, fila = false): string {
  if (!contieneHoy) return fila ? FONDO_FILA : base
  return fila ? FONDO_HOY_HOVER : FONDO_HOY
}

export function PlanillaPorSemana({
  planilla,
  hoy,
  mesAnterior,
  onPagar,
  onEditar,
  onAgregar,
}: {
  planilla: PlanillaCompromisosMes
  hoy: string
  mesAnterior: string
  onPagar: (compromisoId: string) => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAgregar: (grupo: string) => void
}) {
  const semanas = semanasDelMes(planilla.dias, planilla.mes, hoy)
  const hayArrastre = !montosVacios(planilla.arrastreCentavos)
  const { cerrados, toggle, mostrarVacios, setMostrarVacios, vacios, visibles } = useGruposPlanilla(planilla.grupos)
  const [popover, setPopover] = useState<null | { fila: FilaCompromisoMes; semana: SemanaDelMes; rect: DOMRect; boton: HTMLButtonElement }>(null)
  const filas = planilla.grupos.flatMap((grupo) => grupo.filas)
  const totalPagado = sumarCampo(planilla.grupos, 'acumulado')
  const totalFalta = sumarCampo(planilla.grupos, 'diferencia')

  const abrir = (fila: FilaCompromisoMes, semana: SemanaDelMes, boton: HTMLButtonElement) => {
    setPopover((actual) => {
      if (actual?.fila.compromisoId === fila.compromisoId && actual.semana.numero === semana.numero) return null
      return { fila, semana, rect: boton.getBoundingClientRect(), boton }
    })
  }

  return (
    <div className="min-w-0">
      <div className="hidden min-w-0 overflow-x-clip md:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col style={{ width: '30%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${GRILLA} ${FONDO_HEAD} text-left text-[13px] font-medium`}>Concepto</th>
              {hayArrastre ? (
                <th className={`${GRILLA} ${FONDO_HEAD} text-left text-[13px] font-medium leading-tight text-red-700 dark:text-red-400`}>
                  <span className="block">Venía de {mesAnterior}</span>
                  <span className="block">sin pagar</span>
                </th>
              ) : null}
              {semanas.map((semana) => (
                <th
                  key={semana.numero}
                  className={`${GRILLA} text-center text-[13px] font-medium leading-tight ${fondoSemana(semana.contieneHoy, FONDO_HEAD)}`}
                >
                  <span className="block">Semana {semana.numero}</span>
                  <span className="block font-normal tabular-nums text-neutral-500 dark:text-neutral-400">
                    {etiquetaRango(semana.desde, semana.hasta)}
                  </span>
                </th>
              ))}
              <th className={`${GRILLA} ${FONDO_HEAD} text-right text-[13px] font-medium text-emerald-700 dark:text-emerald-400`}>
                Pagado
              </th>
              <th className={`${GRILLA} ${FONDO_HEAD} text-right text-[13px] font-medium leading-tight`}>Falta pagar</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((grupo) => (
              <GrupoTabla
                key={grupo.grupo}
                grupo={grupo}
                semanas={semanas}
                hayArrastre={hayArrastre}
                hoy={hoy}
                cerrado={cerrados[grupo.grupo] === true}
                onToggle={() => toggle(grupo.grupo)}
                onAgregar={() => onAgregar(grupo.grupo)}
                onEditar={onEditar}
                onAbrir={abrir}
                abierto={popover}
              />
            ))}
            <tr>
              <td className={`${GRILLA} ${FONDO_TOTAL} text-[15px] font-bold`}>Total</td>
              {hayArrastre ? (
                <td className={`${GRILLA} ${FONDO_TOTAL} text-right font-bold`}>
                  <MontosEnLineas valores={planilla.arrastreCentavos} corto className="text-red-600 dark:text-red-400" />
                </td>
              ) : null}
              {semanas.map((semana) => (
                <td key={semana.numero} className={`${GRILLA} text-right font-bold ${fondoSemana(semana.contieneHoy, FONDO_TOTAL)}`}>
                  <MontosEnLineas valores={montosPlanificados(filas, semana.fechas)} corto />
                </td>
              ))}
              <td className={`${GRILLA} ${FONDO_TOTAL} text-right font-bold`}>
                <MontosEnLineas valores={totalPagado} corto className="text-emerald-700 dark:text-emerald-400" />
              </td>
              <td className={`${GRILLA} ${FONDO_TOTAL} text-right font-bold`}>
                <MontosEnLineas valores={totalFalta} corto />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {visibles.map((grupo) => (
          <GrupoLista
            key={grupo.grupo}
            grupo={grupo}
            semanas={semanas}
            hayArrastre={hayArrastre}
            mesAnterior={mesAnterior}
            hoy={hoy}
            cerrado={cerrados[grupo.grupo] === true}
            onToggle={() => toggle(grupo.grupo)}
            onAgregar={() => onAgregar(grupo.grupo)}
            onEditar={onEditar}
            onAbrir={abrir}
          />
        ))}
        <section className={`${FONDO_TOTAL} border-t border-neutral-200 px-3 py-2 dark:border-zinc-700`}>
          <p className="text-[15px] font-bold">Total</p>
          <LineasResumen
            semanas={semanas}
            filas={filas}
            hayArrastre={hayArrastre}
            mesAnterior={mesAnterior}
            arrastre={planilla.arrastreCentavos}
            pagado={totalPagado}
            falta={totalFalta}
            destacado
          />
        </section>
      </div>

      <PieGruposVacios cantidad={vacios.length} mostrar={mostrarVacios} onToggle={() => setMostrarVacios((actual) => !actual)} />
      {popover ? (
        <PopoverSemana
          fila={popover.fila}
          semana={popover.semana}
          rect={popover.rect}
          boton={popover.boton}
          hoy={hoy}
          onPagar={() => {
            onPagar(popover.fila.compromisoId)
            setPopover(null)
          }}
          onEditar={() => {
            onEditar(popover.fila)
            setPopover(null)
          }}
          onCerrar={() => setPopover(null)}
        />
      ) : null}
    </div>
  )
}

function GrupoTabla({
  grupo,
  semanas,
  hayArrastre,
  hoy,
  cerrado,
  onToggle,
  onAgregar,
  onEditar,
  onAbrir,
  abierto,
}: {
  grupo: GrupoCompromisoMes
  semanas: SemanaDelMes[]
  hayArrastre: boolean
  hoy: string
  cerrado: boolean
  onToggle: () => void
  onAgregar: () => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAbrir: (fila: FilaCompromisoMes, semana: SemanaDelMes, boton: HTMLButtonElement) => void
  abierto: { fila: FilaCompromisoMes; semana: SemanaDelMes } | null
}) {
  const puedeEditar = usePermisosFinanzas().agenda
  const hayFilas = grupo.filas.length > 0
  return (
    <>
      <tr>
        <td className={`${GRILLA} ${FONDO_GRUPO}`}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            {hayFilas ? (
              <button type="button" className="min-w-0 text-left" aria-expanded={!cerrado} onClick={onToggle}>
                <NombreGrupo cerrado={cerrado}>{grupo.grupo}</NombreGrupo>
              </button>
            ) : (
              <span className="truncate text-[15px] font-medium">{grupo.grupo}</span>
            )}
            <BotonAgregar onClick={onAgregar} />
          </div>
        </td>
        {hayArrastre ? (
          <td className={`${GRILLA} ${FONDO_GRUPO} cursor-pointer text-right font-medium`} onClick={hayFilas ? onToggle : undefined}>
            <MontosEnLineas valores={grupo.subtotal.arrastre} corto className="text-red-600 dark:text-red-400" />
          </td>
        ) : null}
        {semanas.map((semana) => (
          <td
            key={semana.numero}
            className={`${GRILLA} cursor-pointer text-right font-medium ${fondoSemana(semana.contieneHoy, FONDO_GRUPO)}`}
            onClick={hayFilas ? onToggle : undefined}
          >
            <MontosEnLineas valores={montosPlanificados(grupo.filas, semana.fechas)} corto />
          </td>
        ))}
        <td
          className={`${GRILLA} ${FONDO_GRUPO} cursor-pointer text-right font-medium`}
          onClick={hayFilas ? onToggle : undefined}
        >
          <MontosEnLineas valores={grupo.subtotal.acumulado} corto className="text-emerald-700 dark:text-emerald-400" />
        </td>
        <td
          className={`${GRILLA} ${FONDO_GRUPO} cursor-pointer text-right font-medium`}
          onClick={hayFilas ? onToggle : undefined}
        >
          <MontosEnLineas valores={grupo.subtotal.diferencia} corto />
        </td>
      </tr>
      {cerrado
        ? null
        : grupo.filas.map((fila) => (
            <tr
              key={fila.compromisoId}
              className={puedeEditar ? 'group cursor-pointer' : 'group'}
              onClick={puedeEditar ? () => onEditar(fila) : undefined}
            >
              <td className={`${GRILLA} overflow-hidden ${FONDO_FILA}`}>
                <ConceptoFila fila={fila} onEditar={() => onEditar(fila)} />
              </td>
              {hayArrastre ? (
                <td className={`${GRILLA} text-right ${FONDO_FILA}`}>
                  <MontoUno centavos={fila.arrastreCentavos} moneda={fila.moneda} tono="vencido" corto />
                </td>
              ) : null}
              {semanas.map((semana) => {
                const suma = sumaEnSemana(fila.porDia, semana.fechas, hoy)
                const tono = tonoSemana(suma, fila)
                const estaAbierta = abierto?.fila.compromisoId === fila.compromisoId && abierto.semana.numero === semana.numero
                return (
                  <td key={semana.numero} className={`${GRILLA} text-right ${fondoSemana(semana.contieneHoy, FONDO, true)}`}>
                    {tono === 'vacio' ? null : (
                      <button
                        type="button"
                        className={`block w-full truncate text-right tabular-nums underline-offset-2 hover:underline ${claseTono(tono)}`}
                        title={formatMoneyCentavos(suma.planificadoCentavos, fila.moneda)}
                        aria-haspopup="dialog"
                        aria-expanded={estaAbierta}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAbrir(fila, semana, event.currentTarget)
                        }}
                      >
                        {montoCorto(suma.planificadoCentavos, fila.moneda)}
                      </button>
                    )}
                  </td>
                )
              })}
              <td className={`${GRILLA} text-right ${FONDO_FILA}`}>
                <MontoUno
                  centavos={fila.acumuladoCentavos}
                  moneda={fila.moneda}
                  tono="pagado"
                  corto
                  tilde={estaPago(fila)}
                />
              </td>
              <td className={`${GRILLA} text-right ${FONDO_FILA}`}>
                <MontoUno centavos={fila.diferenciaCentavos} moneda={fila.moneda} tono={tonoFalta(fila, hoy)} corto />
              </td>
            </tr>
          ))}
    </>
  )
}

function GrupoLista({
  grupo,
  semanas,
  hayArrastre,
  mesAnterior,
  hoy,
  cerrado,
  onToggle,
  onAgregar,
  onEditar,
  onAbrir,
}: {
  grupo: GrupoCompromisoMes
  semanas: SemanaDelMes[]
  hayArrastre: boolean
  mesAnterior: string
  hoy: string
  cerrado: boolean
  onToggle: () => void
  onAgregar: () => void
  onEditar: (fila: FilaCompromisoMes) => void
  onAbrir: (fila: FilaCompromisoMes, semana: SemanaDelMes, boton: HTMLButtonElement) => void
}) {
  const puedeEditar = usePermisosFinanzas().agenda
  const hayFilas = grupo.filas.length > 0
  return (
    <section className="border-b border-neutral-200 dark:border-zinc-700">
      <div className={`${FONDO_GRUPO} px-3 py-2`}>
        <div className="flex items-center justify-between gap-2">
          {hayFilas ? (
            <button type="button" className="min-w-0 text-left" aria-expanded={!cerrado} onClick={onToggle}>
              <NombreGrupo cerrado={cerrado}>{grupo.grupo}</NombreGrupo>
            </button>
          ) : (
            <span className="text-[15px] font-medium">{grupo.grupo}</span>
          )}
          <BotonAgregar onClick={onAgregar} />
        </div>
        <LineasResumen
          semanas={semanas}
          filas={grupo.filas}
          hayArrastre={hayArrastre}
          mesAnterior={mesAnterior}
          arrastre={grupo.subtotal.arrastre}
          pagado={grupo.subtotal.acumulado}
          falta={grupo.subtotal.diferencia}
        />
      </div>
      {cerrado
        ? null
        : grupo.filas.map((fila) => (
            <article
              key={fila.compromisoId}
              className={
                puedeEditar
                  ? 'cursor-pointer border-t border-neutral-200 px-3 py-2 hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800/70'
                  : 'border-t border-neutral-200 px-3 py-2 dark:border-zinc-700'
              }
              onClick={puedeEditar ? () => onEditar(fila) : undefined}
            >
              <ConceptoFila fila={fila} onEditar={() => onEditar(fila)} />
              <div className="mt-1">
                {hayArrastre && fila.arrastreCentavos > 0 ? (
                  <Linea etiqueta={`Venía de ${mesAnterior} sin pagar`}>
                    <MontoUno centavos={fila.arrastreCentavos} moneda={fila.moneda} tono="vencido" />
                  </Linea>
                ) : null}
                {semanas.map((semana) => {
                  const suma = sumaEnSemana(fila.porDia, semana.fechas, hoy)
                  const tono = tonoSemana(suma, fila)
                  if (tono === 'vacio') return null
                  return (
                    <Linea key={semana.numero} etiqueta={`Semana ${semana.numero} · ${etiquetaRango(semana.desde, semana.hasta)}`} destacado={semana.contieneHoy}>
                      <button
                        type="button"
                        className={`tabular-nums underline-offset-2 hover:underline ${claseTono(tono)}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onAbrir(fila, semana, event.currentTarget)
                        }}
                      >
                        {formatMoneyCentavos(suma.planificadoCentavos, fila.moneda)}
                      </button>
                    </Linea>
                  )
                })}
                <Linea etiqueta="Pagado">
                  {fila.acumuladoCentavos > 0 ? (
                    <MontoUno centavos={fila.acumuladoCentavos} moneda={fila.moneda} tono="pagado" tilde={estaPago(fila)} />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </Linea>
                <Linea etiqueta="Falta pagar">
                  {fila.diferenciaCentavos > 0 ? (
                    <MontoUno centavos={fila.diferenciaCentavos} moneda={fila.moneda} tono={tonoFalta(fila, hoy)} />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </Linea>
              </div>
            </article>
          ))}
    </section>
  )
}

function LineasResumen({
  semanas,
  filas,
  hayArrastre,
  mesAnterior,
  arrastre,
  pagado,
  falta,
  destacado = false,
}: {
  semanas: SemanaDelMes[]
  filas: readonly FilaCompromisoMes[]
  hayArrastre: boolean
  mesAnterior: string
  arrastre: { ars: number; usd: number }
  pagado: { ars: number; usd: number }
  falta: { ars: number; usd: number }
  destacado?: boolean
}) {
  return (
    <div className={destacado ? 'font-bold' : 'font-medium'}>
      {hayArrastre && !montosVacios(arrastre) ? (
        <Linea etiqueta={`Venía de ${mesAnterior} sin pagar`}>
          <MontosEnLineas valores={arrastre} className="text-red-600 dark:text-red-400" />
        </Linea>
      ) : null}
      {semanas.map((semana) => {
        const valores = montosPlanificados(filas, semana.fechas)
        if (montosVacios(valores)) return null
        return (
          <Linea
            key={semana.numero}
            etiqueta={`Semana ${semana.numero} · ${etiquetaRango(semana.desde, semana.hasta)}`}
            destacado={semana.contieneHoy}
          >
            <MontosEnLineas valores={valores} />
          </Linea>
        )
      })}
      {!montosVacios(pagado) ? (
        <Linea etiqueta="Pagado">
          <MontosEnLineas valores={pagado} className="text-emerald-700 dark:text-emerald-400" />
        </Linea>
      ) : null}
      {!montosVacios(falta) ? (
        <Linea etiqueta="Falta pagar">
          <MontosEnLineas valores={falta} />
        </Linea>
      ) : null}
    </div>
  )
}

function Linea({
  etiqueta,
  children,
  destacado = false,
}: {
  etiqueta: string
  children: ReactNode
  destacado?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-3 py-0.5 ${destacado ? 'rounded bg-sky-50 px-1 dark:bg-sky-950' : ''}`}>
      <span className="min-w-0 text-[13px] text-neutral-600 dark:text-neutral-300">{etiqueta}</span>
      <span className="shrink-0 text-right text-[13px]">{children}</span>
    </div>
  )
}

function PopoverSemana({
  fila,
  semana,
  rect,
  boton,
  hoy,
  onPagar,
  onEditar,
  onCerrar,
}: {
  fila: FilaCompromisoMes
  semana: SemanaDelMes
  rect: DOMRect
  boton: HTMLButtonElement
  hoy: string
  onPagar: () => void
  onEditar: () => void
  onCerrar: () => void
}) {
  const puedeEditar = usePermisosFinanzas().agenda
  const panel = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar
  useEffect(() => {
    const cerrar = (event: PointerEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || boton.contains(target)) return
      cerrarRef.current()
    }
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrarRef.current()
    }
    const desde = performance.now()
    const alScroll = () => {
      if (performance.now() - desde < 200) return
      cerrarRef.current()
    }
    document.addEventListener('pointerdown', cerrar)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', alScroll, true)
    return () => {
      document.removeEventListener('pointerdown', cerrar)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', alScroll, true)
    }
  }, [boton])

  const ancho = 288
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8))
  const arriba = rect.bottom + 220 > window.innerHeight && rect.top > 180
  const dias = semana.fechas.flatMap((fecha) => {
    const celda = fila.porDia[fecha]
    if (!celda || (celda.planificadoCentavos <= 0 && celda.pagadoCentavos <= 0)) return []
    return [{ fecha, ...celda }]
  })
  const detalle = detalleCompromiso(fila)

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={`${fila.concepto}, semana ${semana.numero}`}
      className="fixed z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{ top: arriba ? rect.top - 8 : rect.bottom + 6, left, transform: arriba ? 'translateY(-100%)' : undefined }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-[15px] font-medium text-neutral-900 dark:text-gray-100">{fila.concepto}</p>
      <p className="text-[13px] text-neutral-500 dark:text-neutral-400">{detalle}</p>
      <p className="mt-1 text-[13px]">{textoEstado(fila, hoy)}</p>
      <p className="text-body-muted mt-2 text-[13px]">
        Semana {semana.numero} · {etiquetaRango(semana.desde, semana.hasta)}
      </p>
      <ul className="mt-1 space-y-1">
        {dias.map((dia) => (
          <li key={dia.fecha} className="text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="capitalize">{textoDia(dia.fecha)}</span>
              {dia.planificadoCentavos > 0 ? (
                <span className="tabular-nums">{formatMoneyCentavos(dia.planificadoCentavos, fila.moneda)}</span>
              ) : null}
            </div>
            {dia.pagadoCentavos > 0 ? (
              <p className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                pagado {formatMoneyCentavos(dia.pagadoCentavos, fila.moneda)}
              </p>
            ) : null}
            {dia.corrido ? (
              <p className="text-[13px] text-neutral-500 dark:text-neutral-400">Cayó en finde o feriado: se anota este día.</p>
            ) : null}
          </li>
        ))}
      </ul>
      <LineasPagosHechos pagos={fila.pagosResumen} />
      {puedeEditar ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {puedePagarFila(fila) ? (
          <button type="button" className={botonChico} onClick={onPagar}>
            Pagar
          </button>
        ) : null}
        <button type="button" className={botonChicoSecundario} onClick={onEditar}>
          Cambiar
        </button>
      </div>
      ) : null}
    </div>
  )
}
