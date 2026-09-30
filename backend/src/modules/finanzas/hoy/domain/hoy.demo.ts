/**
 * Datos de ejemplo (docs con `demo: true`) solo existen en el entorno de pruebas.
 * Borrarlos desde la API se permite únicamente con el emulador levantado.
 */

export const MENSAJE_SOLO_PRUEBAS = 'Solo en el entorno de pruebas'

/** Colecciones donde el seed deja documentos con `demo: true`. */
export const COLECCIONES_DEMO = ['compromisosPago', 'cobrosEsperados', 'cheques'] as const

export type ColeccionDemo = (typeof COLECCIONES_DEMO)[number]

export interface EntornoDemo {
  FUNCTIONS_EMULATOR?: string | undefined
  FIRESTORE_EMULATOR_HOST?: string | undefined
}

/** true si corre en el emulador de Functions o apunta al emulador de Firestore. */
export function esEntornoDePruebas(env: EntornoDemo = process.env): boolean {
  if (env.FUNCTIONS_EMULATOR === 'true') return true
  return typeof env.FIRESTORE_EMULATOR_HOST === 'string' && env.FIRESTORE_EMULATOR_HOST.trim() !== ''
}

export class SoloEnPruebasError extends Error {
  readonly status = 403
  constructor() {
    super(MENSAJE_SOLO_PRUEBAS)
    this.name = 'SoloEnPruebasError'
  }
}

/** Lanza si no estamos en el entorno de pruebas. Lo usa la ruta y el servicio, por las dudas. */
export function exigirEntornoDePruebas(env: EntornoDemo = process.env): void {
  if (!esEntornoDePruebas(env)) throw new SoloEnPruebasError()
}
