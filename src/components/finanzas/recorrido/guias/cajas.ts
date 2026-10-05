import type { Guia } from '../pasosRecorrido'

const RUTA = '/finanzas/cajas'
const CERRAR_SIN_GUARDAR = 'Acá guardarías. Para practicar, cerrá la ventana con la ✕: no se guarda nada.'

export const GUIAS_CAJAS: Guia[] = [
  {
    id: 'cajas-gasto-ingreso',
    pantalla: 'cajas',
    titulo: 'Registrar un gasto o un ingreso',
    pasos: [
      {
        id: 'boton',
        ruta: RUTA,
        selector: 'cajas-registrar-gasto',
        tipo: 'tocar',
        espera: 'cajas-movimiento-ventana',
        titulo: 'Registrar',
        texto:
          'Tocá «Registrar pago» (en una caja chica dice «Anotar un gasto»). Para un ingreso es igual, con «Registrar ingreso».',
        sinDatos:
          'No ves estos botones porque la caja elegida no está a tu cargo o está cerrada esperando aprobación. Arriba elegí una caja tuya. Te cuento cómo sigue.',
      },
      {
        id: 'concepto',
        ruta: RUTA,
        selector: 'cajas-movimiento-concepto',
        tipo: 'completar',
        ventana: 'cajas-movimiento-ventana',
        titulo: 'En qué fue',
        texto: 'Escribí en qué fue, con tus palabras: «Nafta», «Librería», «Cobro de Juan».',
      },
      {
        id: 'monto',
        ruta: RUTA,
        selector: 'cajas-movimiento-monto',
        tipo: 'completar',
        ventana: 'cajas-movimiento-ventana',
        titulo: 'Cuánto',
        texto: 'El monto. Coma para los centavos.',
      },
      {
        id: 'comprobante',
        ruta: RUTA,
        selector: 'cajas-movimiento-comprobante',
        tipo: 'completar',
        ventana: 'cajas-movimiento-ventana',
        opcional: true,
        titulo: 'El ticket',
        texto: 'Si es un gasto, sacale una foto al ticket. Es opcional, pero ayuda cuando se cierra la caja.',
      },
      {
        id: 'guardar',
        ruta: RUTA,
        selector: 'cajas-movimiento-guardar',
        ventana: 'cajas-movimiento-ventana',
        titulo: 'Guardar',
        texto: CERRAR_SIN_GUARDAR,
      },
    ],
  },
  {
    id: 'cajas-fondear',
    pantalla: 'cajas',
    titulo: 'Fondear una caja chica',
    pasos: [
      {
        id: 'boton',
        ruta: RUTA,
        selector: 'cajas-fondear',
        tipo: 'tocar',
        espera: 'cajas-fondeo-ventana',
        titulo: 'Fondear',
        texto: 'Con la caja principal elegida arriba, tocá «Fondear una caja».',
        sinDatos:
          '«Fondear una caja» aparece en la caja principal que tenés a cargo, y solo si tiene cajas chicas vinculadas. Te cuento cómo sigue.',
      },
      {
        id: 'caja',
        ruta: RUTA,
        selector: 'cajas-fondeo-caja',
        tipo: 'completar',
        ventana: 'cajas-fondeo-ventana',
        titulo: 'Qué caja recibe',
        texto: 'Elegí la caja chica que recibe la plata.',
      },
      {
        id: 'monto',
        ruta: RUTA,
        selector: 'cajas-fondeo-monto',
        tipo: 'completar',
        ventana: 'cajas-fondeo-ventana',
        titulo: 'Cuánto',
        texto: 'Cuánto le pasás. Sale de la principal y entra en la chica, con un solo movimiento.',
      },
      {
        id: 'confirmar',
        ruta: RUTA,
        selector: 'cajas-fondeo-confirmar',
        ventana: 'cajas-fondeo-ventana',
        titulo: 'Confirmar',
        texto: CERRAR_SIN_GUARDAR,
      },
    ],
  },
  {
    id: 'cajas-cerrar',
    pantalla: 'cajas',
    titulo: 'Cerrar una caja',
    pasos: [
      {
        id: 'elegir',
        ruta: RUTA,
        selector: 'cajas-saldos',
        titulo: 'Qué caja',
        texto: 'Arriba, elegí la caja chica que vas a cerrar. Las principales no se cierran.',
      },
      {
        id: 'pestana',
        ruta: RUTA,
        selector: 'cajas-pestana-cierres',
        tipo: 'tocar',
        espera: 'cajas-cerrar-tarjeta',
        titulo: 'Cierres',
        texto: 'Tocá la pestaña «Cierres».',
      },
      {
        id: 'efectivo',
        ruta: RUTA,
        selector: 'cajas-cerrar-efectivo',
        tipo: 'completar',
        titulo: 'Contá la plata',
        texto: 'Contá el efectivo que hay en la caja y escribí cuánto. BacarNet lo compara con lo que debería haber.',
      },
      {
        id: 'boton',
        ruta: RUTA,
        selector: 'cajas-cerrar-boton',
        titulo: 'Cerrar caja',
        texto:
          'Acá cerrarías: la caja queda bloqueada hasta que Finanzas apruebe el cierre. Para practicar, borrá el número y no toques el botón: no se guarda nada.',
      },
    ],
  },
  {
    id: 'cajas-aprobar',
    pantalla: 'cajas',
    titulo: 'Aprobar un cierre (líder)',
    permiso: 'manage_finanzas_caja',
    pasos: [
      {
        id: 'pestana',
        ruta: RUTA,
        selector: 'cajas-pestana-cierres',
        tipo: 'tocar',
        espera: 'cajas-pendientes',
        titulo: 'Cierres',
        texto: 'Tocá la pestaña «Cierres».',
      },
      {
        id: 'pendientes',
        ruta: RUTA,
        selector: 'cajas-pendientes',
        titulo: 'Los que esperan',
        texto: 'Acá están las cajas cerradas esperando tu aprobación, con el saldo que debería tener y la diferencia que contó el encargado.',
      },
      {
        id: 'aprobar',
        ruta: RUTA,
        selector: 'cajas-aprobar',
        opcional: true,
        titulo: 'Aprobar',
        texto: 'Con «Aprobar cierre» la caja se desbloquea. Esto sí se guarda al tocarlo: hacelo solo cuando revisaste la diferencia.',
      },
    ],
  },
]
