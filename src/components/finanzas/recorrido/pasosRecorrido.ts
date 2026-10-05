import type { PermisosFinanzasEfectivos } from '../../../services/userService'

/** Permiso de Finanzas que hace falta para la tarea (mismos nombres que en Usuarios). */
export type PermisoFinanzas =
  | 'finanzas_agenda'
  | 'finanzas_cheques'
  | 'finanzas_categorias'
  | 'finanzas_transferencias'
  | 'finanzas_destinatarios'
  | 'finanzas_saldos'
  | 'manage_finanzas_caja'

/** Nombre del permiso, en palabras, para las frases del globo y del panel. */
export const ETIQUETA_PERMISO: Record<PermisoFinanzas, string> = {
  finanzas_agenda: 'cargar y pagar la agenda',
  finanzas_cheques: 'cargar cheques',
  finanzas_categorias: 'categorías y reglas',
  finanzas_transferencias: 'armar y cancelar transferencias',
  finanzas_destinatarios: 'la agenda de destinatarios',
  finanzas_saldos: 'cargar saldos y descubiertos',
  manage_finanzas_caja: 'líder de cajas',
}

const CLAVE_EFECTIVA: Record<PermisoFinanzas, keyof PermisosFinanzasEfectivos> = {
  finanzas_agenda: 'agenda',
  finanzas_cheques: 'cheques',
  finanzas_categorias: 'categorias',
  finanzas_transferencias: 'transferencias',
  finanzas_destinatarios: 'destinatarios',
  finanzas_saldos: 'saldos',
  manage_finanzas_caja: 'liderCajas',
}

export function tienePermiso(permisos: PermisosFinanzasEfectivos, permiso: PermisoFinanzas | undefined): boolean {
  if (!permiso) return true
  return permisos[CLAVE_EFECTIVA[permiso]]
}

/**
 * Cómo se comporta un paso:
 * - explicar: globo y botón Siguiente (como el paseo).
 * - tocar: resalta un botón y espera a que la persona lo toque; avanza solo cuando aparece lo esperado.
 * - completar: señala un campo del formulario y explica qué poner; Siguiente lo pasa la persona.
 */
export type TipoPaso = 'explicar' | 'tocar' | 'completar'

export interface PasoRecorrido {
  id: string
  /** Ruta de react-router, con la búsqueda si la pantalla tiene pestañas. */
  ruta: string
  /** Valor de data-tour del elemento a señalar. */
  selector: string
  titulo: string
  texto: string
  /** Si no se indica, es 'explicar'. */
  tipo?: TipoPaso
  /**
   * Solo para 'tocar': data-tour que tiene que aparecer para avanzar solo (p. ej. la ventana que se abre).
   * Si no se indica, se usa el selector del paso siguiente.
   */
  espera?: string
  /** data-tour de la ventana donde vive el paso. Si la persona la cierra a mitad, la guía vuelve al paso que la abrió. */
  ventana?: string
  /** Si el elemento no está (no hay datos), se muestra este texto en el centro y la guía sigue solo explicando. */
  sinDatos?: string
  /** Paseo: si la persona no lo tiene, el globo no señala el botón y explica quién lo hace. */
  permiso?: PermisoFinanzas
  /** Si el elemento no está (no hay datos), el paso se salta. */
  opcional?: boolean
}

export type PantallaId =
  | 'hoy'
  | 'saldos'
  | 'agenda'
  | 'cajas'
  | 'transferencias'
  | 'movimientos'
  | 'extractos'
  | 'cheques'

export interface Pantalla {
  id: PantallaId
  nombre: string
  pathname: string
}

export const PANTALLAS: Pantalla[] = [
  { id: 'hoy', nombre: 'Hoy', pathname: '/finanzas/hoy' },
  { id: 'saldos', nombre: 'Saldos', pathname: '/finanzas/cuentas' },
  { id: 'agenda', nombre: 'Agenda', pathname: '/finanzas/agenda' },
  { id: 'cajas', nombre: 'Cajas', pathname: '/finanzas/cajas' },
  { id: 'transferencias', nombre: 'Transferencias', pathname: '/finanzas/transferencias' },
  { id: 'movimientos', nombre: 'Movimientos', pathname: '/finanzas/movimientos' },
  { id: 'extractos', nombre: 'Extractos', pathname: '/finanzas/extractos' },
  { id: 'cheques', nombre: 'Cheques', pathname: '/finanzas/cheques' },
]

/** Una guía "Cómo se hace…": pasos sobre una sola pantalla. */
export interface Guia {
  id: string
  pantalla: PantallaId
  titulo: string
  /** Permiso que pide la tarea. Sin él, la guía se abre igual pero solo explica, sin señalar botones ocultos. */
  permiso?: PermisoFinanzas
  pasos: PasoRecorrido[]
}

export const TITULO_FINAL = '¡Listo!'
export const TEXTO_FINAL_PASEO = "Podés repetir el paseo o abrir una guía paso a paso cuando quieras desde 'Ayuda'."
export const TEXTO_FINAL_GUIA = "Podés volver a esta guía cuando quieras desde 'Ayuda'."
export const TEXTO_VENTANA_CERRADA =
  "Se cerró la ventana, así que la guía termina acá. Podés volver a abrirla cuando quieras desde 'Ayuda'."
export const TEXTO_PRACTICA = 'Acá confirmarías. Para practicar, tocá «Cancelar»: no se guarda nada.'
