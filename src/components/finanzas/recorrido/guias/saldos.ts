import type { Guia, PasoRecorrido } from '../pasosRecorrido'

const RUTA = '/finanzas/cuentas'
const VENTANA_TRANSFERENCIA = 'transferencia-ventana'

const SIN_CUENTAS = 'Todavía no hay cuentas en pesos para practicar. Tocá «Actualizar» para traerlas de Interbanking. Te cuento cómo sigue.'

function tocarSiguiente(id: string, espera: string): PasoRecorrido {
  return {
    id,
    ruta: RUTA,
    selector: 'transferencia-siguiente',
    tipo: 'tocar',
    espera,
    ventana: VENTANA_TRANSFERENCIA,
    titulo: 'Seguimos',
    texto: 'Tocá «Siguiente».',
  }
}

export const GUIAS_SALDOS: Guia[] = [
  {
    id: 'saldos-transferir-propias',
    pantalla: 'saldos',
    titulo: 'Transferir entre cuentas propias',
    permiso: 'finanzas_transferencias',
    pasos: [
      {
        id: 'transferir',
        ruta: RUTA,
        selector: 'saldos-transferir',
        tipo: 'tocar',
        espera: VENTANA_TRANSFERENCIA,
        titulo: 'Desde qué banco',
        texto: 'En la tabla de bancos, tocá «Transferir» en el banco de donde sale la plata.',
        sinDatos: SIN_CUENTAS,
      },
      {
        id: 'origen',
        ruta: RUTA,
        selector: 'transferencia-origen',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'Cuenta de origen',
        texto: 'Ya viene elegida: es el banco desde el que tocaste «Transferir». Abajo ves cuánto tiene disponible.',
      },
      {
        id: 'tipo',
        ruta: RUTA,
        selector: 'transferencia-tipo',
        tipo: 'completar',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'El tipo',
        texto: 'En «Tipo» elegí «Entre cuentas propias».',
      },
      tocarSiguiente('siguiente-1', 'transferencia-destino'),
      {
        id: 'destino',
        ruta: RUTA,
        selector: 'transferencia-destino',
        tipo: 'completar',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'A qué cuenta',
        texto: 'Elegí la cuenta a la que va la plata.',
      },
      tocarSiguiente('siguiente-2', 'transferencia-monto'),
      {
        id: 'monto',
        ruta: RUTA,
        selector: 'transferencia-monto',
        tipo: 'completar',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'El monto',
        texto: 'Escribí cuánto. Usá coma para los centavos, por ejemplo 1.250,50.',
      },
      {
        id: 'concepto',
        ruta: RUTA,
        selector: 'transferencia-concepto',
        tipo: 'completar',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'El concepto',
        texto: 'Unas palabras que digan para qué es. Es lo que ve el banco.',
      },
      tocarSiguiente('siguiente-3', 'transferencia-resumen'),
      {
        id: 'confirmar',
        ruta: RUTA,
        selector: 'transferencia-confirmar',
        ventana: VENTANA_TRANSFERENCIA,
        titulo: 'Confirmar',
        texto:
          'Acá confirmarías: queda armada esperando la firma en Interbanking. Para practicar, tocá «Volver» hasta llegar a «Cancelar»: no se guarda nada.',
      },
    ],
  },
  {
    id: 'saldos-descubierto',
    pantalla: 'saldos',
    titulo: 'Cambiar el descubierto de un banco',
    permiso: 'finanzas_saldos',
    pasos: [
      {
        id: 'saldo',
        ruta: RUTA,
        selector: 'saldos-banco-saldo',
        tipo: 'tocar',
        espera: 'saldos-detalle-ventana',
        titulo: 'Abrí el banco',
        texto: 'Tocá el saldo del banco al que le querés cambiar el descubierto.',
        sinDatos: SIN_CUENTAS,
      },
      {
        id: 'cambiar',
        ruta: RUTA,
        selector: 'saldos-cambiar-descubierto',
        tipo: 'tocar',
        espera: 'saldos-descubierto-ventana',
        ventana: 'saldos-detalle-ventana',
        titulo: 'El descubierto',
        texto: 'Tocá «Cambiar descubierto» (o «Cargar descubierto» si todavía no tiene).',
      },
      {
        id: 'monto',
        ruta: RUTA,
        selector: 'saldos-descubierto-monto',
        tipo: 'completar',
        ventana: 'saldos-descubierto-ventana',
        titulo: 'El límite',
        texto: 'Escribí el límite que te dio el banco. Si lo dejás vacío, queda sin acuerdo.',
      },
      {
        id: 'desde',
        ruta: RUTA,
        selector: 'saldos-descubierto-desde',
        tipo: 'completar',
        ventana: 'saldos-descubierto-ventana',
        titulo: 'Desde cuándo',
        texto: 'Si sabés desde cuándo rige, ponelo. Es opcional.',
      },
      {
        id: 'guardar',
        ruta: RUTA,
        selector: 'saldos-descubierto-guardar',
        ventana: 'saldos-descubierto-ventana',
        titulo: 'Guardar',
        texto: 'Acá guardarías. Para practicar, tocá «Cancelar»: no se guarda nada.',
      },
    ],
  },
  {
    id: 'saldos-historial',
    pantalla: 'saldos',
    titulo: 'Ver cómo cerró un día (historial)',
    pasos: [
      {
        id: 'historial',
        ruta: RUTA,
        selector: 'saldos-historial',
        titulo: 'Historial de cierres',
        texto: 'Cada fila es un día: cómo quedó la posición a las 15 hs, con el descubierto que tenía cada banco.',
      },
      {
        id: 'dia',
        ruta: RUTA,
        selector: 'saldos-historial-dia',
        tipo: 'tocar',
        espera: 'saldos-historial-detalle',
        titulo: 'Abrí un día',
        texto: 'Tocá un día para verlo por banco.',
        sinDatos: 'Todavía no hay cierres. El primero se guarda solo hoy a las 15 hs. Te cuento cómo sigue.',
      },
      {
        id: 'detalle',
        ruta: RUTA,
        selector: 'saldos-historial-detalle',
        titulo: 'Banco por banco',
        texto: 'Acá ves cómo quedó cada banco ese día: saldo, descubierto y cuánto le quedaba para usar.',
      },
    ],
  },
]
