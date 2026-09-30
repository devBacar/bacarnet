/**
 * Días hábiles de Argentina: lunes a viernes, sin feriados fijos.
 * No incluye feriados que se corren de fecha (carnaval, Semana Santa, puentes).
 */
const FERIADOS_MMDD = new Set([
  '01-01',
  '03-24',
  '04-02',
  '05-01',
  '05-25',
  '06-20',
  '07-09',
  '12-08',
  '12-25',
])

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function esDiaHabil(iso: string): boolean {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  const dow = date.getUTCDay()
  if (dow === 0 || dow === 6) return false
  const mmdd = iso.slice(5)
  return !FERIADOS_MMDD.has(mmdd)
}

/** Suma (o resta) N días hábiles. El día de partida no cuenta. */
export function sumarDiasHabiles(iso: string, dias: number): string {
  let left = Math.abs(dias)
  const step = dias >= 0 ? 1 : -1
  let cursor = iso
  while (left > 0) {
    cursor = addIsoDays(cursor, step)
    if (esDiaHabil(cursor)) left -= 1
  }
  return cursor
}

/**
 * `fecha` cae entre `ancla` menos `diasAntes` hábiles y `ancla` más `diasDespues` hábiles,
 * inclusive. Los fines de semana que quedan adentro del rango también entran.
 */
export function fechaEnRangoHabil(fecha: string, ancla: string, diasAntes: number, diasDespues: number): boolean {
  const desde = sumarDiasHabiles(ancla, -diasAntes)
  const hasta = sumarDiasHabiles(ancla, diasDespues)
  return fecha >= desde && fecha <= hasta
}

export function diasEntre(desde: string, hasta: string): string[] {
  if (hasta < desde) return []
  const dias: string[] = []
  let cursor = desde
  while (cursor <= hasta) {
    dias.push(cursor)
    cursor = addIsoDays(cursor, 1)
  }
  return dias
}

/** Parte un rango en tramos de a lo sumo `maxDias` días corridos (inclusive). */
export function tramosDeDias(
  desde: string,
  hasta: string,
  maxDias: number,
): Array<{ desde: string; hasta: string }> {
  if (hasta < desde || maxDias < 1) return []
  const tramos: Array<{ desde: string; hasta: string }> = []
  let cursor = desde
  while (cursor <= hasta) {
    const fin = addIsoDays(cursor, maxDias - 1)
    const hastaTramo = fin < hasta ? fin : hasta
    tramos.push({ desde: cursor, hasta: hastaTramo })
    cursor = addIsoDays(hastaTramo, 1)
  }
  return tramos
}
