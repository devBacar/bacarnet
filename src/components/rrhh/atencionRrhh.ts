import type { CifrasPeriodoRrhh, PeriodoRrhh } from '../../services/rrhhApi'
import { numero } from './formatoRrhh'
import type { SeleccionArea } from './PeriodosRrhh'

/** Avisos del mes para "Lo que hay que atender". */
export function atencionDelMes(p: PeriodoRrhh, c: CifrasPeriodoRrhh, seleccion: SeleccionArea): string[] {
  const out: string[] = []
  const mas30 = c.personasMas30 ?? 0
  if (mas30 > 0) {
    const mayor = seleccion === 'todas' ? [...p.areas].sort((a, b) => (b.personasMas30 ?? 0) - (a.personasMas30 ?? 0))[0] : undefined
    out.push(
      `${numero(mas30)} ${mas30 === 1 ? 'persona hizo' : 'personas hicieron'} más de 30 horas extra en el mes, que es lo máximo que permite la ley.${
        mayor && (mayor.personasMas30 ?? 0) > 0 ? ` La mayoría en ${mayor.nombre} (${mayor.personasMas30}).` : ''
      }`,
    )
  }
  return out
}
