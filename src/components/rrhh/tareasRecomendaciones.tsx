import type { RecomendacionRrhh } from '../../services/rrhhApi'
import { pesosCorto } from './formatoRrhh'
import type { Tarea } from './ResumenSimpleRrhh'

/** Recomendaciones del backend como tareas numeradas, con su ahorro o costo. */
export function tareasDeRecomendaciones(recs: RecomendacionRrhh[], maximo = 5): Tarea[] {
  return recs.slice(0, maximo).map((r) => ({
    clave: r.id,
    texto: (
      <>
        <strong className="font-semibold text-neutral-900 dark:text-gray-100">{r.titulo}</strong> {r.detalle}
        <span className="mt-1 block text-[13px] text-neutral-500 dark:text-gray-400">
          {r.area} · Norma: {r.regla}
        </span>
      </>
    ),
    ...(r.impacto && r.impacto.monto > 0
      ? {
          plata: pesosCorto(r.impacto.monto),
          plataAbajo: r.impacto.etiqueta,
          tonoPlata: r.categoria === 'Feriados' ? ('rojo' as const) : ('verde' as const),
        }
      : r.categoria === 'Límite legal'
        ? { plata: 'Riesgo legal', plataAbajo: 'juicios y multas', tonoPlata: 'azul' as const }
        : {}),
  }))
}
