import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  cambiarPactadaRrhh,
  type CambioPactadaRrhh,
  type PactadasAgregadoRrhh,
  type PersonaPactadaRrhh,
} from '../../services/rrhhApi'
import { numero, numero1, pesosCorto } from './formatoRrhh'

const horas = (h: number) => (Number.isInteger(h) ? numero(h) : numero1(h))
import { BandaRrhh, BarrasGasto, NotaRrhh, NumerosGrandes, PocasPalabras, TituloDetalle } from './ResumenSimpleRrhh'
import { TarjetaRrhh } from './TarjetaRrhh'

const TEXTO_CAMBIO: Record<CambioPactadaRrhh, string> = {
  confirmar: 'Confirmada',
  descartar: 'Se quita de la lista',
  automatico: 'Vuelve a decidir el sistema',
}

/** Horas extra pactadas: acuerdos individuales que no se pueden reducir. RRHH confirma o quita a cada persona. */
export function HorasPactadasRrhh({
  pactadas,
  personas,
  descartadas,
}: {
  pactadas: PactadasAgregadoRrhh
  /** null: el usuario no tiene permiso de detalle (Directorio). */
  personas: PersonaPactadaRrhh[] | null
  descartadas: { legajo: number; nombre: string; area: string }[]
}) {
  const [cambios, setCambios] = useState<Record<number, CambioPactadaRrhh>>({})
  const cambio = useMutation({
    mutationFn: ({ legajo, tipo }: { legajo: number; tipo: CambioPactadaRrhh }) => cambiarPactadaRrhh(legajo, tipo),
    onSuccess: (_d, v) => setCambios((c) => ({ ...c, [v.legajo]: v.tipo })),
  })
  const sobre30 = (personas ?? []).filter((p) => p.horas50 + p.horas100 > 30).length
  const areasCasiTodo = pactadas.porArea.filter((a) => a.personas > 0).map((a) => a.nombre)

  const boton = (legajo: number, tipo: CambioPactadaRrhh, texto: string, primario = false) => (
    <button
      type="button"
      disabled={cambio.isPending}
      onClick={() => cambio.mutate({ legajo, tipo })}
      className={`rounded-md px-3 py-1.5 text-[13.5px] font-medium transition disabled:opacity-50 ${
        primario
          ? 'bg-brand-primary text-white hover:opacity-90'
          : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800'
      }`}
    >
      {texto}
    </button>
  )

  return (
    <div className="grid gap-5">
      <BandaRrhh
        titulo="Horas extra pactadas"
        subtitulo="Acuerdos individuales: siempre la misma cantidad de horas extra, todos los meses"
        tono="pactadas"
      />
      <NumerosGrandes
        items={[
          { etiqueta: 'Personas con acuerdo', valor: numero(pactadas.personas), nota: `en ${pactadas.porArea.length} áreas` },
          { etiqueta: 'Cuestan por mes', valor: pesosCorto(pactadas.costoMes), nota: `unas ${numero(pactadas.horasMes)} horas extra` },
          { etiqueta: 'Cuestan por año', valor: pesosCorto(pactadas.costoMes * 12), nota: 'a valores del último mes' },
        ]}
      />
      <PocasPalabras
        frases={[
          <>
            Son <strong>tratos hechos aparte</strong> con cada persona. Por eso <strong>no se cuentan</strong> en las metas de reducción ni en el
            plan de ahorro.
          </>,
          'Se pagan igual todos los meses; en algunos casos, también en los meses con vacaciones.',
          ...(areasCasiTodo.length ? [`Hay acuerdos en: ${areasCasiTodo.join(', ')}.`] : []),
          ...(sobre30 > 0
            ? [`${sobre30} de las ${personas?.length ?? 0} personas pasan las 30 horas por mes que fija la ley. Conviene revisar con el asesor legal cómo están documentados estos acuerdos.`]
            : []),
        ]}
      />
      <BarrasGasto titulo="¿En qué áreas?" items={pactadas.porArea.map((a) => ({ nombre: `${a.nombre} (${a.personas})`, valor: a.costoMes }))} />

      {personas ? (
        <>
          <TituloDetalle>Solo perfil RRHH · el Directorio ve solo los totales</TituloDetalle>
          <TarjetaRrhh
            titulo="Las personas"
            subtitulo="El sistema las detecta solo: misma cantidad de horas extra todos los meses (o casi). Confirmá o quitá a cada una."
            pie="Los cambios quedan guardados y se aplican en la próxima actualización de datos (15:30 y 22:30, o con «Actualizar desde Salario»)."
          >
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[14.5px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-neutral-600 dark:text-gray-400">
                    <th className="py-2 pr-2 font-semibold">Persona</th>
                    <th className="px-2 py-2 text-right font-semibold">Al 50%</th>
                    <th className="px-2 py-2 text-right font-semibold">Al 100%</th>
                    <th className="px-2 py-2 text-right font-semibold">Costo por mes</th>
                    <th className="px-2 py-2 text-right font-semibold">Horas en el año</th>
                    <th className="px-2 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {personas.map((p) => (
                    <tr key={p.legajo} className="border-t border-neutral-100 align-top dark:border-zinc-800">
                      <td className="py-2.5 pr-2">
                        <span className="text-neutral-900 dark:text-gray-100">{p.nombre}</span>
                        <span className="block text-[12.5px] text-neutral-500 dark:text-gray-400">
                          {p.area} · {p.puesto} · legajo {p.legajo} · igual {p.mesesIguales} de {p.mesesConHoras} meses
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{p.horas50 ? horas(p.horas50) : '—'}</td>
                      <td className="px-2 py-2.5 text-right">{p.horas100 ? horas(p.horas100) : '—'}</td>
                      <td className="px-2 py-2.5 text-right">{pesosCorto(p.costoMes)}</td>
                      <td className={`px-2 py-2.5 text-right ${p.horasAnio > 200 ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                        {numero(p.horasAnio)} h
                      </td>
                      <td className="px-2 py-2.5">
                        {cambios[p.legajo] ? (
                          <span className="text-[13.5px] font-medium text-emerald-700 dark:text-emerald-400">{TEXTO_CAMBIO[cambios[p.legajo]]} ✓</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {p.estado === 'confirmada' ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12.5px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                                Confirmada por RRHH
                              </span>
                            ) : (
                              boton(p.legajo, 'confirmar', 'Confirmar', true)
                            )}
                            {boton(p.legajo, 'descartar', 'No es pactada')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cambio.isError ? (
              <p role="alert" className="mt-2 text-[13.5px] text-red-700 dark:text-red-400">
                {cambio.error instanceof Error ? cambio.error.message : 'No se pudo guardar el cambio.'}
              </p>
            ) : null}
          </TarjetaRrhh>
          {descartadas.length > 0 ? (
            <TarjetaRrhh titulo="Personas que RRHH sacó de la lista">
              <ul className="grid gap-2 text-[14.5px]">
                {descartadas.map((d) => (
                  <li key={d.legajo} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {d.nombre} <span className="text-neutral-500 dark:text-gray-400">· {d.area} · legajo {d.legajo}</span>
                    </span>
                    {cambios[d.legajo] ? (
                      <span className="text-[13.5px] font-medium text-emerald-700 dark:text-emerald-400">{TEXTO_CAMBIO[cambios[d.legajo]]} ✓</span>
                    ) : (
                      boton(d.legajo, 'automatico', 'Volver a la lista')
                    )}
                  </li>
                ))}
              </ul>
            </TarjetaRrhh>
          ) : null}
        </>
      ) : (
        <NotaRrhh>Los nombres de las personas con horas pactadas solo los ve el perfil RRHH.</NotaRrhh>
      )}
    </div>
  )
}
