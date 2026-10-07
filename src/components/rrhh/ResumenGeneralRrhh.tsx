import type { ReactNode } from 'react'
import type { InformeRrhh, PeriodoRrhh } from '../../services/rrhhApi'
import { aclaracionCorte, mesLargo, numero, pesosCorto } from './formatoRrhh'
import { bajasNoPrevistas, porcentaje, sumarIndicadores, tasaAusentismo, tempranasNoPrevistas, totalLicenciasLargas } from './indicadoresDatos'
import { atencionDelMes } from './atencionRrhh'
import { AtenderRrhh, BandaRrhh } from './ResumenSimpleRrhh'

export type SeccionRrhh = 'resumen' | 'horas' | 'personal' | 'costos' | 'evolucion'

function variacion(actual: number, anterior: number | undefined, sufijo = 'contra el mes anterior'): string | null {
  if (!anterior) return null
  const v = actual / anterior - 1
  if (Math.abs(v) < 0.005) return `igual ${sufijo}`
  return `${v > 0 ? 'subió' : 'bajó'} ${porcentaje(Math.abs(v), 0)} ${sufijo}`
}

function Tema({
  titulo,
  valor,
  nota,
  frase,
  tono,
  onVer,
  boton,
}: {
  titulo: string
  valor: string
  nota?: string | null
  frase: ReactNode
  tono?: 'rojo' | 'verde'
  onVer: () => void
  boton: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-neutral-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="text-[18px] font-semibold text-[#1f3b63] dark:text-blue-300">{titulo}</h3>
      <p
        className={`text-[32px] font-bold leading-tight tabular-nums ${
          tono === 'rojo' ? 'text-red-700 dark:text-red-400' : tono === 'verde' ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-900 dark:text-gray-100'
        }`}
      >
        {valor}
      </p>
      {nota ? <p className="text-[14.5px] text-neutral-600 dark:text-gray-400">{nota}</p> : null}
      <p className="text-[16px] leading-snug text-neutral-800 dark:text-gray-200">{frase}</p>
      <button
        type="button"
        onClick={onVer}
        className="mt-auto self-start rounded-md border border-neutral-300 px-3 py-1.5 text-[14px] font-medium text-[#1f3b63] transition hover:bg-neutral-50 dark:border-zinc-700 dark:text-blue-300 dark:hover:bg-zinc-800"
      >
        {boton} →
      </button>
    </section>
  )
}

/** Primera pantalla: lo más importante del último mes cerrado, en cuatro temas, con acceso a cada sección. */
export function ResumenGeneralRrhh({ datos, ultimoCerrado, onIr }: { datos: InformeRrhh; ultimoCerrado: PeriodoRrhh | undefined; onIr: (s: SeccionRrhh) => void }) {
  const mes = ultimoCerrado?.mes ?? datos.ultimoMes
  const he = ultimoCerrado?.total

  const ind = datos.indicadores
  const filasMes = ind ? ind.filas.filter((f) => f.mes === mes) : []
  const mesAnterior = ind?.meses[ind.meses.indexOf(mes) - 1]
  const tMes = filasMes.length ? sumarIndicadores(filasMes) : null
  const tAnt = mesAnterior && ind ? sumarIndicadores(ind.filas.filter((f) => f.mes === mesAnterior)) : null
  const hayAusencias = !!ind?.primerMesAusencias && mes >= ind.primerMesAusencias

  const costosMes = datos.costos?.filas.filter((f) => f.mes === mes) ?? []
  const costoMes = costosMes.reduce((s, f) => s + f.costoLaboral, 0)
  const netoMes = costosMes.reduce((s, f) => s + f.neto, 0)
  const personasMes = costosMes.reduce((s, f) => s + f.personas, 0)
  const mesAntCostos = datos.costos?.meses[datos.costos.meses.indexOf(mes) - 1]
  const costoAnt = mesAntCostos ? (datos.costos?.filas.filter((f) => f.mes === mesAntCostos).reduce((s, f) => s + f.costoLaboral, 0) ?? 0) : 0

  const medio = datos.planes?.planes.find((p) => p.id === 'medio')
  const atender = ultimoCerrado ? atencionDelMes(ultimoCerrado, ultimoCerrado.total, 'todas') : []
  if (tMes && tempranasNoPrevistas(tMes) > 0) atender.push(`${numero(tempranasNoPrevistas(tMes))} personas se fueron antes de cumplir 3 meses sin que se les terminara el contrato.`)
  if (tMes && hayAusencias && tMes.dias.injustificadas > 0) atender.push(`${numero(tMes.dias.injustificadas)} días de faltas sin aviso en el mes.`)

  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo={`Resumen de ${mesLargo(mes)}`}
        subtitulo={
          <>
            Último mes cerrado en Salario · lo más importante en una sola pantalla
            <span className="block text-[14px] opacity-90">{aclaracionCorte(mes)}</span>
          </>
        }
        tono="real"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {he ? (
          <Tema
            titulo="Horas extra"
            valor={pesosCorto(he.costo)}
            nota={`${numero(he.horasTotal)} horas · costo para la empresa${he.anterior ? ` · ${variacion(he.costo, he.anterior.costo)}` : ''}`}
            tono={he.anterior && he.costo > he.anterior.costo * 1.05 ? 'rojo' : undefined}
            frase={
              medio && medio.ahorroAnual > 0 ? (
                <>
                  Con el plan medio se podrían ahorrar <strong>{pesosCorto(medio.ahorroAnual)} por año</strong>.
                </>
              ) : (
                'Horas extra, feriados trabajados y compensatorias del mes.'
              )
            }
            onVer={() => onIr('horas')}
            boton="Ver horas extra y plan de ahorro"
          />
        ) : null}

        {tMes ? (
          <Tema
            titulo="Ausencias"
            valor={hayAusencias ? porcentaje(tasaAusentismo(tMes)) : '—'}
            nota={
              hayAusencias
                ? `de los días de trabajo se perdieron por ausencias${tAnt ? ` · el mes anterior, ${porcentaje(tasaAusentismo(tAnt))}` : ''}`
                : 'sin datos de ausencias'
            }
            frase={
              <>
                {numero(tMes.dias.enfermedad)} días por enfermedad y {numero(tMes.dias.injustificadas)} de faltas sin aviso.{' '}
                {totalLicenciasLargas(tMes) > 0
                  ? `${numero(totalLicenciasLargas(tMes))} ${totalLicenciasLargas(tMes) === 1 ? 'persona' : 'personas'} con licencia larga.`
                  : 'Nadie con licencia larga al cierre.'}
              </>
            }
            onVer={() => onIr('personal')}
            boton="Ver ausencias y rotación"
          />
        ) : null}

        {tMes ? (
          <Tema
            titulo="Altas y bajas"
            valor={`${numero(tMes.altas)} / ${numero(tMes.bajas)}`}
            nota="entraron / se fueron"
            frase={
              tMes.bajas > 0 ? (
                <>
                  {numero(bajasNoPrevistas(tMes))} bajas no previstas (renuncias, despidos y otras) y {numero(tMes.bajasPorMotivo.finContrato)} por fin de contrato.
                  {tMes.bajasTempranas > 0 ? ` ${numero(tMes.bajasTempranas)} se fueron antes de los 3 meses.` : ''}
                </>
              ) : (
                'No hubo bajas en el mes.'
              )
            }
            onVer={() => onIr('personal')}
            boton="Ver ausencias y rotación"
          />
        ) : null}

        {costoMes > 0 ? (
          <Tema
            titulo="Costo de personal"
            valor={pesosCorto(costoMes)}
            nota={`costo laboral del mes${costoAnt > 0 ? ` · ${variacion(costoMes, costoAnt)}` : ''}`}
            frase={
              <>
                Se depositaron <strong>{pesosCorto(netoMes)}</strong> de sueldos a {numero(personasMes)} personas (se pagan a principios del mes siguiente).
              </>
            }
            onVer={() => onIr('costos')}
            boton="Ver costos"
          />
        ) : null}
      </div>

      <AtenderRrhh frases={atender} />
    </div>
  )
}
