#!/usr/bin/env node
/**
 * Tablero "Seguridad Privada" (HTML estático en Drive, carpeta Tableros Gerencia > Financiero > Seguridad Privada):
 * recalcula con datos frescos de Vientri la facturación mensual (tot.fact) y los Ingresos Brutos (tot.iibb) de
 * Seguridad, y reemplaza SOLO esos dos arrays dentro del JSON embebido en el index.html, sin tocar nada más.
 *
 * Por qué solo estos dos números (de los que pide la Fase 1 acordada: horas, facturación y resultado):
 *   - Horas trabajadas/marcadas/pagadas y sueldos y cargas: dependen del sistema de Sueldos (Salario). Bacarnet
 *     SÍ tiene un pipeline real que ya calcula esto por centro de costo (backend/src/modules/rrhh/domain/evolucion.ts,
 *     alimentado por backend/src/modules/rrhh/services/ingestaRrhh.ts), y el centro de costo "SERVICIO DE SEGURIDAD
 *     PRIVADA" (distinto de "SEGURIDAD PLANTA", que no es Seguridad Privada) ya existe ahí. El bloqueo no es de
 *     datos: es que leerlo requiere Firestore de producción (colección rrhh_informe, con sueldos reales de
 *     personas), y ese acceso quedó pendiente de que alguien lo autorice explícitamente.
 *   - Horas facturadas (tot.hf): se probó reconstruir desde los renglones de factura de Vientri. Para los clientes
 *     facturados "por hora" cierra casi exacto, pero para los clientes de "abono fijo" el tablero viejo convierte
 *     su monto a horas-equivalente con la tarifa de ese cliente, una regla que no está documentada en ningún lado
 *     accesible; reconstruirla a ciegas dio hasta 60% de error contra los meses ya conocidos. Queda sin tocar.
 *   - Otros gastos del servicio (tot.otros): se probó reconstruir con la clasificación oficial de rubro/subrubro
 *     del plan de cuentas de Vientri (gastos_seguridad.sql), pero una parte de ese gasto (la flota propia de
 *     Seguridad) se contabiliza en centros de costo de vehículos individuales ("MOVIL 005", etc.), no en
 *     "SERVICIO DE SEGURIDAD PRIVADA", y depende de una lista externa de vehículos (de Sistemas) que no está en
 *     Vientri ni en Bacarnet. Sin esa lista el número queda sistemáticamente muy por debajo del real (entre 15%
 *     y 60% del valor conocido, probado con varias combinaciones de rubros). Queda sin tocar.
 *   - Resultado: depende de sueldos, otros gastos y gastos generales (que a su vez depende de sueldos de las
 *     áreas de apoyo), así que sigue sin poder recalcularse mientras esos dos puntos sigan bloqueados.
 *
 * Métodos usados, ambos validados contra los 24 meses que ya tenía el tablero:
 *
 *   Facturación (<2% de diferencia en 22 de 24 meses) = suma de NETO de facturas (FAA, FAB, CFA) con
 *   id_unegocio = 1 ("SERVICIO DE SEGURIDAD") menos la suma de NETO de notas de crédito (NCA, NCB, CCA) del mismo
 *   id_unegocio, agrupado por mes de FEC_CMP (columna `fecha` de comprobantes.csv).
 *
 *   Ingresos Brutos (<5% de diferencia en 21 de 23 meses con dato; las excepciones son un mes que ya era
 *   "provisional" en el tablero viejo -se completaba con un promedio porque la contabilidad no estaba cerrada- y
 *   otro con una diferencia puntual del 18% no explicada) = suma de (DEBE - HABER) de las cuentas del rubro
 *   "EGRESOS / CARGAS TRIBUTARIAS" (Impuesto a los Ingresos Brutos, Tasa de Comercio e Industria, multas e
 *   impuestos varios) del centro de costo "SERVICIO DE SEGURIDAD PRIVADA", agrupado por mes de la cabecera del
 *   asiento (columna `mes` de gastos_seguridad.sql). Si un mes da 0 (la contabilidad de ese mes todavía no cerró),
 *   se lo trata como "sin dato nuevo" y se deja el valor que ya tenía el tablero, igual que con facturación.
 *
 * Uso:
 *   node actualizar-facturacion.mjs --comprobantes <comprobantes.csv> --html <index.html> --out <salida.html> [--gastos <gastos_seguridad.csv>]
 *
 *   --gastos es opcional: sin él, solo se actualiza facturación (igual que antes). Para generarlo, correr
 *   sql/gastos_seguridad.sql contra la base de Vientri (mismo mecanismo que scripts/vientri-export).
 *
 * No escribe en Drive ni en ningún otro lado: deja el HTML nuevo en --out para que alguien lo revise y lo suba.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ID_UNEGOCIO_SEGURIDAD = '1'
const TIPOS_FACTURA = new Set(['FAA', 'FAB', 'CFA'])
const TIPOS_NOTA_CREDITO = new Set(['NCA', 'NCB', 'CCA'])
const RUBRO_IIBB = 'EGRESOS'
const SUBRUBRO_IIBB = 'CARGAS TRIBUTARIAS'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      out[arg.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return out
}

/** Parser de CSV simple: alcanza porque el export de Vientri no pone `;` dentro de campos sin comillas, y las
 * columnas que usamos acá (fecha, montos, códigos) nunca llevan comillas. Tolera `\n` y `\r\n`. */
function parseCsv(texto) {
  const lineas = texto.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)).filter((l) => l.length > 0)
  const encabezado = lineas[0].split(';')
  const filas = []
  for (let i = 1; i < lineas.length; i += 1) {
    const valores = lineas[i].split(';')
    const fila = {}
    for (let c = 0; c < encabezado.length; c += 1) fila[encabezado[c]] = valores[c] ?? ''
    filas.push(fila)
  }
  return filas
}

/** { 'YYYY-MM': centavosNeto } para la línea Seguridad, facturas menos notas de crédito. */
function calcularFacturacionMensual(filasComprobantes) {
  const porMes = new Map()
  for (const fila of filasComprobantes) {
    if (fila.id_unegocio !== ID_UNEGOCIO_SEGURIDAD) continue
    const tipo = fila.nom_tipo
    const esFactura = TIPOS_FACTURA.has(tipo)
    const esNotaCredito = TIPOS_NOTA_CREDITO.has(tipo)
    if (!esFactura && !esNotaCredito) continue
    const mes = (fila.fecha || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    const neto = Number(fila.neto)
    if (!Number.isFinite(neto)) continue
    const actual = porMes.get(mes) ?? 0
    porMes.set(mes, actual + (esFactura ? neto : -neto))
  }
  return porMes
}

/** { 'YYYY-MM': centavosIIBB } de Seguridad. Un mes en 0 significa "esa contabilidad todavía no cerró": se saca
 * del mapa para que el llamador lo trate como "sin dato nuevo", no como "los Ingresos Brutos fueron cero". */
function calcularIibbMensual(filasGastos) {
  const porMes = new Map()
  for (const fila of filasGastos) {
    if (fila.rubro !== RUBRO_IIBB || fila.subrubro !== SUBRUBRO_IIBB) continue
    const mes = fila.mes
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    const importe = Number(fila.importe)
    if (!Number.isFinite(importe)) continue
    porMes.set(mes, (porMes.get(mes) ?? 0) + importe)
  }
  for (const [mes, importe] of porMes) {
    if (Math.round(importe) === 0) porMes.delete(mes)
  }
  return porMes
}

/** Reemplaza `datos.tot[campo][i]` por el valor de `porMes` para cada mes que tenga dato nuevo; deja el resto igual.
 * Si un mes nuevo da menos del 5% del promedio de los demás meses con dato, lo avisa: probablemente la
 * contabilidad de ese mes todavía no cerró del todo (como con el mes "provisional" que ya manejaba el tablero
 * viejo) y conviene revisarlo a mano antes de subir el HTML en vez de confiar en el número tal cual. */
function aplicarValores(datos, campo, porMes, etiqueta) {
  let actualizados = 0
  const sinDatoNuevo = []
  const nuevos = [...porMes.values()]
  const promedio = nuevos.length > 0 ? nuevos.reduce((a, b) => a + b, 0) / nuevos.length : 0
  const sospechosos = []
  datos.meses.forEach((mes, i) => {
    if (porMes.has(mes)) {
      const anterior = datos.tot[campo][i]
      const nuevo = Math.round(porMes.get(mes))
      if (nuevo !== anterior) actualizados += 1
      if (promedio > 0 && Math.abs(nuevo) < promedio * 0.05) sospechosos.push(mes)
      datos.tot[campo][i] = nuevo
    } else {
      sinDatoNuevo.push(mes)
    }
  })
  if (sinDatoNuevo.length > 0) {
    console.log(`  ${etiqueta}: sin dato nuevo en ${sinDatoNuevo.length} meses (quedan con el valor que ya tenían): ${sinDatoNuevo.join(', ')}`)
  }
  if (sospechosos.length > 0) {
    console.log(
      `  ${etiqueta}: OJO, estos meses dieron un valor mucho más chico que el resto (revisar a mano antes de subir, puede ser contabilidad sin cerrar): ${sospechosos.join(', ')}`,
    )
  }
  console.log(`  ${etiqueta}: ${actualizados} de ${datos.meses.length} meses con valor distinto al que tenía el tablero.`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.comprobantes || !args.html || !args.out) {
    console.error(
      'Uso: node actualizar-facturacion.mjs --comprobantes <csv> --html <index.html> --out <salida.html> [--gastos <gastos_seguridad.csv>]',
    )
    process.exit(1)
  }

  const html = readFileSync(args.html, 'utf8')
  const inicioTag = '<script type="application/json" id="datos">'
  const inicio = html.indexOf(inicioTag)
  if (inicio < 0) throw new Error('No encontré <script type="application/json" id="datos"> en el HTML')
  const inicioJson = inicio + inicioTag.length
  const finJson = html.indexOf('</script>', inicioJson)
  if (finJson < 0) throw new Error('No encontré el cierre </script> del bloque de datos')

  const datos = JSON.parse(html.slice(inicioJson, finJson))
  if (!Array.isArray(datos.meses) || !datos.tot || !Array.isArray(datos.tot.fact) || !Array.isArray(datos.tot.iibb)) {
    throw new Error('La forma del JSON embebido cambió (meses/tot.fact/tot.iibb): revisar antes de seguir')
  }

  const filasComprobantes = parseCsv(readFileSync(args.comprobantes, 'utf8'))
  console.log(`Comprobantes leídos: ${filasComprobantes.length}.`)
  aplicarValores(datos, 'fact', calcularFacturacionMensual(filasComprobantes), 'Facturación')

  if (args.gastos) {
    const filasGastos = parseCsv(readFileSync(args.gastos, 'utf8'))
    console.log(`Gastos de Seguridad leídos: ${filasGastos.length}.`)
    aplicarValores(datos, 'iibb', calcularIibbMensual(filasGastos), 'Ingresos Brutos')
  } else {
    console.log('  Ingresos Brutos: no se pasó --gastos, queda sin tocar.')
  }

  const nuevoBloque = JSON.stringify(datos)
  const nuevoHtml = html.slice(0, inicioJson) + nuevoBloque + html.slice(finJson)
  writeFileSync(args.out, nuevoHtml, 'utf8')
  console.log(`Escrito: ${args.out} (${nuevoHtml.length} caracteres, original tenía ${html.length}).`)
}

main()
