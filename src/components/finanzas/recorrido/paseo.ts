import type { PasoRecorrido } from './pasosRecorrido'

/** Paseo por el módulo: 3 minutos, 1–2 pasos por pantalla. Qué hay y para qué sirve. */
export const PASEO: PasoRecorrido[] = [
  {
    id: 'hoy-numeros',
    ruta: '/finanzas/hoy',
    selector: 'hoy-numeros',
    titulo: 'Hoy, en cuatro números',
    texto:
      'Con cuánto arrancás el día, cuánto pagás, cuánto cobrás y en cuánto terminás. Se actualiza solo con lo que manda el banco.',
  },
  {
    id: 'hoy-pagos',
    ruta: '/finanzas/hoy',
    selector: 'hoy-pagos',
    titulo: 'Pagos y cobros de hoy',
    texto:
      "Lo que vence hoy. 'Pagar' abre las formas de pago: podés combinar cheque, efectivo y transferencia. Al lado, los cobros que esperás.",
    permiso: 'finanzas_agenda',
  },
  {
    id: 'saldos-bancos',
    ruta: '/finanzas/cuentas',
    selector: 'saldos-bancos',
    titulo: 'Saldos',
    texto: 'Cuánto hay en cada banco, el descubierto y cuánto te queda para usar. Desde acá también transferís.',
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
    titulo: 'Agenda',
    texto: 'Todo lo que hay que pagar y cobrar. Cargalo una vez y aparece en Hoy el día que vence.',
    permiso: 'finanzas_agenda',
  },
  {
    id: 'agenda-planilla',
    ruta: '/finanzas/agenda?tab=planilla',
    selector: 'agenda-planilla',
    titulo: 'Planilla del mes',
    texto: 'Tu planilla de compromisos, por semana o por día. Tocá un monto para pagarlo o cambiarlo.',
    permiso: 'finanzas_agenda',
  },
  {
    id: 'cajas',
    ruta: '/finanzas/cajas',
    selector: 'cajas',
    titulo: 'Cajas',
    texto: 'El efectivo. La caja principal fondea a las cajas chicas; cada encargado anota, rinde y cierra su caja.',
  },
  {
    id: 'transferencias',
    ruta: '/finanzas/transferencias',
    selector: 'transferencias-lista',
    titulo: 'Transferencias',
    texto:
      'Las transferencias armadas. Se firman con tu token en Interbanking; BacarNet solo ve cuándo se hicieron o si las rechazaron.',
  },
  {
    id: 'movimientos',
    ruta: '/finanzas/movimientos',
    selector: 'movimientos',
    titulo: 'Movimientos',
    texto: 'Cada débito y crédito que manda el banco. Podés ponerle categoría y una palabra para tu planilla.',
    permiso: 'finanzas_categorias',
  },
  {
    id: 'extractos',
    ruta: '/finanzas/extractos',
    selector: 'extractos',
    titulo: 'Extractos',
    texto: 'Para bajar el resumen del banco en Excel, con la categoría de BacarNet.',
  },
  {
    id: 'cheques',
    ruta: '/finanzas/cheques',
    selector: 'cheques',
    titulo: 'Cheques',
    texto: 'La cartera de cheques recibidos, los emitidos y los endosados.',
  },
]
