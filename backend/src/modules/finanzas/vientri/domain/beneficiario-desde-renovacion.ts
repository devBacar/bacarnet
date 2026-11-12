import { REVISAR_SIN_DESTINATARIO } from './beneficiario-desde-obs.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { numeroCorto } from './propuesta-renovacion.js'

/**
 * Un cheque de renovación que vino sin destinatario hereda el beneficiario de los cheques que renueva, si todos los
 * que nombra el OBS y están cargados son del mismo beneficiario (ej. "Renovacion cheques n° 38842742, 38842744…" del
 * 23/01/2026: 21 cheques sin destinatario que renuevan 20 cheques de MANA). Se encadena: la renovación de una
 * renovación que ya heredó también hereda.
 *
 * Se recalcula siempre desde cero (los que ya habían heredado vuelven a empezar sin destinatario), así si cambia un
 * cheque viejo cambia también el nuevo; si deja de poder heredarse, vuelve a quedar "Sin destinatario".
 * Va después de `completarBeneficiarioDesdeObs`: si el OBS empieza con un nombre conocido, manda el OBS.
 */

/** Las cadenas de renovaciones son cortas; esto solo corta un ciclo raro. */
const MAX_VUELTAS = 20

/** Deshace la herencia: el cheque vuelve a estar como vino de Vientri, sin destinatario. */
export function sinBeneficiarioHeredado(d: ChequeOcasionalDoc): ChequeOcasionalDoc {
  if (!d.beneficiarioDesdeRenovacion) return d
  return {
    ...d,
    beneficiario: '',
    beneficiarioNormalizado: '',
    beneficiarioDesdeRenovacion: false,
    revisar: d.revisar.includes(REVISAR_SIN_DESTINATARIO) ? d.revisar : [...d.revisar, REVISAR_SIN_DESTINATARIO],
  }
}

export function completarBeneficiariosDesdeRenovacion(docs: ChequeOcasionalDoc[]): ChequeOcasionalDoc[] {
  const res = docs.map(sinBeneficiarioHeredado)
  const porNumero = new Map<string, number>()
  res.forEach((d, i) => {
    if (!d.baja && d.numeroCheque) porNumero.set(numeroCorto(d.numeroCheque), i)
  })

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    let cambio = false
    res.forEach((d, i) => {
      if (d.baja || d.beneficiarioNormalizado !== '' || d.renovacionDe.length === 0) return
      const viejos = d.renovacionDe
        .map((n) => porNumero.get(numeroCorto(n)))
        .filter((j): j is number => j !== undefined && j !== i)
        .map((j) => res[j]!)
      // Todos los viejos encontrados tienen que tener beneficiario (si alguno todavía no, puede heredarlo en otra vuelta).
      if (viejos.length === 0 || viejos.some((v) => v.beneficiarioNormalizado === '')) return
      const nombres = new Set(viejos.map((v) => v.beneficiarioNormalizado))
      if (nombres.size !== 1) return
      const v = viejos[0]!
      res[i] = {
        ...d,
        beneficiario: v.beneficiario,
        beneficiarioNormalizado: v.beneficiarioNormalizado,
        beneficiarioDesdeRenovacion: true,
        revisar: d.revisar.filter((t) => t !== REVISAR_SIN_DESTINATARIO),
      }
      cambio = true
    })
    if (!cambio) break
  }
  return res
}
