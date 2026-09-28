const FALLBACK =
  'Interbanking rechazó la confección. Revisá los datos o contactá al banco.'

const MONTO =
  'El monto supera el límite permitido para esta cuenta o tipo de transferencia.'
const DEBITO =
  'La cuenta de débito no está habilitada para este tipo de transferencia.'
const HORARIO_DEBITO =
  'Fuera del horario habilitado por el banco de débito para este tipo de transferencia. Probar de nuevo en horario bancario.'
const CREDITO =
  'La cuenta de destino no está habilitada para recibir este tipo de transferencia.'
const CREDITO_NUEVA =
  'La cuenta de destino es muy nueva, hay que esperar 24 horas desde su activación.'
const HORARIO_CREDITO = 'Fuera del horario habilitado por el banco de destino.'
const BANCO =
  'El banco de débito o crédito no acepta este tipo de operación en este momento.'
const FECHA =
  'La fecha de pago elegida no es válida para este tipo de transferencia.'

/** Clave en minúsculas: sufijo, código numérico o alias. */
const INTERBANKING_ERROR_MESSAGES: Record<string, string> = {}

function mapMessage(message: string, ...codes: string[]): void {
  for (const code of codes) {
    INTERBANKING_ERROR_MESSAGES[code.trim().toLowerCase()] = message
  }
}

mapMessage(
  MONTO,
  'impctaparte',
  'topetrxctapartedebito',
  'topetrdiaxctapartedebito',
  'impacctapartedebito',
  'importetefexcedido',
  'monto.supera.tope',
)

mapMessage(
  DEBITO,
  'ctacontrol.debito.no.operativa',
  'ctadebha',
  'cuentadebitousohabilitado',
  'cuentainhabilitadadebito',
  'cuentapartenohabilitada',
  'ctapartenotef',
  'operadormodousodebito',
  'opectapartedebito',
  'cuentamodousodebito',
  'openotef',
)

mapMessage(HORARIO_DEBITO, 'horariohadebito', '1110')

mapMessage(
  CREDITO,
  'ctacontrol.credito.no.operativa',
  'ctacredha',
  'cuentacreditousohabilitado',
  'cuentacontrapartenohabilitada',
  'opectapartecredito',
  'operadormodousocredito',
  'cuentamodousocredito',
)

mapMessage(CREDITO_NUEVA, 'ctacreditonuevanosuperatiempespera')
mapMessage(HORARIO_CREDITO, 'horariohacredito')

mapMessage('Las cuentas de débito y crédito no pueden ser la misma.', 'ctasiguales')
mapMessage('Las dos cuentas deben ser de la misma moneda.', 'monedasdistintas', 'tipomoneda')
mapMessage('No hay horarios cargados para este banco.', 'nohayhorario')
mapMessage('El comentario/referencia supera el límite de caracteres.', 'idinternomuylargo')
mapMessage(
  'Se superó la cantidad máxima de transferencias permitidas para este tipo.',
  'canttefexcedido',
)
mapMessage(
  'No tenés habilitado este tipo de transferencia. Consultar con Interbanking o el banco.',
  'servicio_no_habilitado',
)

mapMessage(
  BANCO,
  'banconooperativo',
  'banconooperadebitos',
  'banconooperacreditos',
  'bancocreditonoaceptatipotransferencia',
  'bancodebitonoaceptatipotransferencia',
  'bancocreditonoaceptamultibanco',
  'bancodebitonoaceptamultibanco',
  'banconoofreceservicio',
)
mapMessage(
  'Este operador no tiene habilitación para operar con ese banco.',
  'operadornooperaconbanco',
)

mapMessage(FECHA, 'diasdiferimientomin', 'diasdiferimientomax')

/** En la ficha, junto a los errores de crédito, y no estaba en la lista pedida. */
mapMessage(
  'El banco de crédito no acepta transferencias con esa fecha de solicitud.',
  'nosepuedetratarbcocrednoaceptadif',
)

mapMessage('El CBU de la cuenta crédito debe tener 22 dígitos.', 'cbu.invalido')

/** Códigos numéricos de validación del OpenAPI (400), además del 1110 visto en vivo. */
mapMessage('La confección no incluye transferencias.', '1000')
mapMessage('La cuenta de débito es obligatoria.', '1002')
mapMessage('La cuenta de crédito es obligatoria.', '1003')
mapMessage('La fecha de solicitud es inválida.', '1004')
mapMessage('Falta un campo obligatorio.', '1005')
mapMessage('El tipo de dato de un campo es incorrecto.', '1006', 'confecciontipodatoinvalido')
mapMessage('Un campo supera la longitud máxima.', '1007', 'confeccionlongitudstring')
mapMessage('Error interno de Interbanking.', '1009')
mapMessage('La fecha de solicitud tiene que ser hoy.', '1010')
mapMessage('La cuenta de débito no existe.', '1012', 'confeccioncuentaorigennoexiste')
mapMessage('La cuenta de crédito no existe.', '1013')
mapMessage('El identificador de la transferencia tiene que ser único.', '1014')
mapMessage('El decimal del importe está mal especificado.', '1021')
mapMessage('El importe tiene que ser mayor a cero.', '1022')
mapMessage('Un campo debe ser alfanumérico.', '1045')
mapMessage('Un campo no puede contener caracteres especiales.', '1047')
mapMessage('Hay un parámetro que Interbanking no espera.', '1051')
mapMessage('La fecha de solicitud está vencida.', '1075')
mapMessage('Falta un campo obligatorio en la cuenta de débito o crédito.', '1076')
mapMessage('Un campo no tiene la longitud definida.', '1077')
mapMessage(
  'El operador no tiene acceso a la cuenta de débito o crédito, o esa cuenta no existe.',
  '1078',
)
mapMessage('El VEP informado no existe o no pertenece a la empresa.', '1079')
mapMessage(
  'El tipo de documento o de retención de la addenda de proveedores no es válido.',
  '1080',
)
mapMessage('Un campo supera el valor máximo.', '1081')
mapMessage('El concepto no es válido.', '1084')
mapMessage('Hay que aceptar el disclaimer del concepto.', '1085')

const KNOWN_PREFIXES = ['tef.gestion.error.', 'transf.conf.error.', 'tef.tratam.error.']

function lookup(key: string): string | null {
  return INTERBANKING_ERROR_MESSAGES[key] ?? null
}

export function translateInterbankingError(code: string): string {
  const key = code.trim().toLowerCase()
  if (!key) return FALLBACK

  const exact = lookup(key)
  if (exact) return exact

  const numeric = key.match(/^(\d{3,4})\b/)
  if (numeric) {
    const byNumber = lookup(numeric[1])
    if (byNumber) return byNumber
  }

  for (const prefix of KNOWN_PREFIXES) {
    const at = key.indexOf(prefix)
    if (at < 0) continue
    const suffix = key.slice(at + prefix.length).split(/[^a-z0-9_.]/)[0] ?? ''
    const bySuffix = suffix ? lookup(suffix) : null
    if (bySuffix) return bySuffix
  }

  return FALLBACK
}

export function translateInterbankingErrors(codes: string[] | null | undefined): string[] | null {
  if (!codes?.length) return null
  return codes.map(translateInterbankingError)
}
