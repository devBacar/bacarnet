export type NivelAlerta = 'ok' | 'atencion' | 'critico'

export function nivelAusentes(n: number): NivelAlerta {
  if (n <= 0) return 'ok'
  if (n <= 3) return 'atencion'
  return 'critico'
}

export function nivelVacantes(n: number): NivelAlerta {
  if (n <= 0) return 'ok'
  if (n <= 2) return 'atencion'
  return 'critico'
}

export function nivelNovedades(n: number): NivelAlerta {
  if (n <= 0) return 'ok'
  if (n <= 3) return 'atencion'
  return 'critico'
}

/** Mismo criterio que novedades (0 ok, 1–3 atención, >3 crítico). */
export function nivelFtCiclo(n: number): NivelAlerta {
  return nivelNovedades(n)
}

/** pctPublicado en escala 0–100. */
export function nivelPctPublicado(pct: number): NivelAlerta {
  if (pct >= 90) return 'ok'
  if (pct >= 70) return 'atencion'
  return 'critico'
}

/** Clases de texto según nivel (reusa danger / emerald / amber del sistema). */
export function claseNivel(nivel: NivelAlerta): string {
  if (nivel === 'ok') return 'text-emerald-700 dark:text-emerald-400'
  if (nivel === 'atencion') return 'text-amber-800 dark:text-amber-300'
  return 'text-danger'
}
