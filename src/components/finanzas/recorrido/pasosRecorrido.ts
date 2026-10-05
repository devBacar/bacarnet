import type { PermisosFinanzasEfectivos } from '../../../services/userService'

/** Permiso de Finanzas que hace falta para la tarea de ese paso. */
export type PermisoPaso = keyof PermisosFinanzasEfectivos

export interface PasoRecorrido {
  id: string
  /** Ruta de react-router, con la búsqueda si la pantalla tiene pestañas. */
  ruta: string
  /** Valor de data-tour del elemento a señalar. */
  selector: string
  titulo: string
  texto: string
  /** Si la persona no lo tiene, el globo no señala el botón y explica quién lo hace. */
  permiso?: PermisoPaso
  /** Nombre del permiso, en palabras, para la frase del globo. */
  etiquetaPermiso?: string
  /** Si el elemento no está (no hay datos), el paso se salta. */
  opcional?: boolean
}

export const TITULO_FINAL = '¡Listo!'
export const TEXTO_FINAL = "Podés repetir el recorrido cuando quieras desde 'Ver recorrido'."

export const PASOS_RECORRIDO: PasoRecorrido[] = [
  {
    id: 'hoy-numeros',
    ruta: '/finanzas/hoy',
    selector: 'hoy-numeros',
    titulo: 'Cuatro números',
    texto:
      'Con cuánto arrancás el día, cuánto pagás, cuánto cobrás y en cuánto terminás. Se actualiza solo con lo que manda el banco.',
  },
  {
    id: 'hoy-pagos',
    ruta: '/finanzas/hoy',
    selector: 'hoy-pagos',
    titulo: 'Pagos de hoy',
    texto:
      "Lo que vence hoy. 'Pagar' abre las formas de pago: podés combinar cheque, efectivo y transferencia.",
    permiso: 'agenda',
    etiquetaPermiso: 'cargar y pagar la agenda',
  },
  {
    id: 'hoy-cobros',
    ruta: '/finanzas/hoy',
    selector: 'hoy-cobros',
    titulo: 'Cobros de hoy',
    texto: 'Lo que esperás cobrar. Se confirma solo cuando entra la plata al banco.',
  },
  {
    id: 'hoy-semana',
    ruta: '/finanzas/hoy',
    selector: 'hoy-semana',
    titulo: 'Compromisos de esta semana',
    texto: 'Arriba en rojo lo vencido sin pagar; después cada día de la semana.',
  },
  {
    id: 'hoy-avisos',
    ruta: '/finanzas/hoy',
    selector: 'hoy-avisos',
    titulo: 'Ojo con esto',
    texto: 'Avisos: cheques que se debitan, transferencias esperando firma, cobros atrasados.',
  },
  {
    id: 'saldos-bancos',
    ruta: '/finanzas/cuentas',
    selector: 'saldos-bancos',
    titulo: 'Tabla de bancos',
    texto: 'Cuánto hay en cada banco, el descubierto y cuánto te queda para usar.',
  },
  {
    id: 'saldos-transferir',
    ruta: '/finanzas/cuentas',
    selector: 'saldos-transferir',
    titulo: 'Botón Transferir',
    texto: 'Para pasar plata entre cuentas o pagarle a alguien. Queda esperando la firma en Interbanking.',
    permiso: 'transferencias',
    etiquetaPermiso: 'armar y cancelar transferencias',
  },
  {
    id: 'saldos-dia',
    ruta: '/finanzas/cuentas',
    selector: 'saldos-dia',
    titulo: 'Entradas y salidas del día',
    texto: 'Lo que entró y salió de cada banco hoy, ordenado por tipo.',
  },
  {
    id: 'saldos-historial',
    ruta: '/finanzas/cuentas',
    selector: 'saldos-historial',
    titulo: 'Historial de cierres',
    texto: 'Cómo terminó cada día cada banco. Tocá un día para ver el detalle.',
  },
  {
    id: 'agenda-pagos',
    ruta: '/finanzas/agenda?tab=pagos',
    selector: 'agenda-pagos',
    titulo: 'Compromisos de pago',
    texto: 'Todo lo que hay que pagar. Cargalo una vez y aparece en Hoy el día que vence.',
    permiso: 'agenda',
    etiquetaPermiso: 'cargar y pagar la agenda',
  },
  {
    id: 'agenda-cobros',
    ruta: '/finanzas/agenda?tab=cobros',
    selector: 'agenda-cobros',
    titulo: 'Cobros esperados',
    texto: 'Lo que te tienen que pagar.',
  },
  {
    id: 'agenda-planilla',
    ruta: '/finanzas/agenda?tab=planilla',
    selector: 'agenda-planilla',
    titulo: 'Planilla del mes',
    texto: 'Tu planilla de compromisos, por semana o por día. Tocá un monto para pagarlo o cambiarlo.',
    permiso: 'agenda',
    etiquetaPermiso: 'cargar y pagar la agenda',
  },
  {
    id: 'agenda-hechos',
    ruta: '/finanzas/agenda?tab=pagos&vista=hechos',
    selector: 'agenda-hechos',
    titulo: 'Pagos hechos',
    texto: 'Qué pagaste y con qué: cheque, efectivo o transferencia.',
  },
  {
    id: 'cajas',
    ruta: '/finanzas/cajas',
    selector: 'cajas',
    titulo: 'Cajas',
    texto: 'El efectivo. La caja principal fondea a las cajas chicas; cada encargado rinde y cierra su caja.',
  },
  {
    id: 'transferencias',
    ruta: '/finanzas/transferencias',
    selector: 'transferencias-lista',
    titulo: 'Transferencias',
    texto:
      'Acá ves las transferencias armadas. Se aprueban con tu token en Interbanking; BacarNet ve solo cuando se hicieron o si las rechazaron.',
  },
  {
    id: 'movimientos',
    ruta: '/finanzas/movimientos',
    selector: 'movimientos',
    titulo: 'Movimientos',
    texto: 'Cada débito y crédito que manda el banco. Podés ponerle categoría y una palabra para tu planilla.',
    permiso: 'categorias',
    etiquetaPermiso: 'categorías y reglas',
  },
  {
    id: 'extractos',
    ruta: '/finanzas/extractos',
    selector: 'extractos',
    titulo: 'Extractos',
    texto: 'Para bajar el resumen del banco en Excel.',
  },
  {
    id: 'cheques',
    ruta: '/finanzas/cheques',
    selector: 'cheques',
    titulo: 'Cheques',
    texto: 'La cartera de cheques recibidos, los emitidos y los endosados.',
  },
]
