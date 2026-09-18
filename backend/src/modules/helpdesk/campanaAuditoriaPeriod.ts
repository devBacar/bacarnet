/** Semana ISO (1–53) y año ISO de una fecha local. */
export function getCampanaArchivoPeriod(date: Date): {
  anio: number
  mes: number
  semanaIso: number
} {
  const mes = date.getMonth() + 1
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const semanaIso = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  const anio = utc.getUTCFullYear()
  return { anio, mes, semanaIso }
}
