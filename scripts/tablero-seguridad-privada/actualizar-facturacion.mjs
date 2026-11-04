#!/usr/bin/env node
/**
 * Tablero "Seguridad Privada" (HTML estático en Drive, carpeta Tableros Gerencia > Financiero > Seguridad Privada):
 * recalcula con datos frescos de Vientri y RRHH la facturación (tot.fact), los Ingresos Brutos (tot.iibb), las
 * horas facturadas (tot.hf), los sueldos y cargas (tot.mo) y las horas pagadas (tot.hp) de Seguridad, y reemplaza
 * SOLO esos cinco arrays dentro del JSON embebido en el index.html, sin tocar nada más (ni las tablas por
 * cliente, ni ninguna otra sección del informe).
 *
 * "Resultado" no es un campo guardado: la propia página lo calcula en el navegador a partir de
 * tot.fact − tot.mo − tot.otros − tot.iibb − tot.est. Con este script, fact/iibb/hf/mo/hp quedan frescos pero
 * tot.otros y tot.est (gastos generales, que también depende de sueldos de áreas de apoyo) siguen con el valor
 * del 22/10/2026: el "resultado" que se ve en pantalla después de correr esto es una MEZCLA de componentes
 * frescos y viejos, no un número 100% actualizado. Quien lo use tiene que saber eso.
 *
 * Estado de la Fase 1 acordada (horas, facturación, sueldos/resultado), por pieza:
 *
 *   - Facturación (tot.fact): HECHO. <2% de diferencia en 22 de 24 meses contra lo que ya tenía el tablero.
 *   - Ingresos Brutos (tot.iibb): HECHO. <5% de diferencia en 21 de 23 meses con dato.
 *   - Horas facturadas (tot.hf): HECHO. ~4% de diferencia en 22 de 23 meses con dato.
 *   - Horas pagadas (tot.hp): HECHO. Sale de backend/src/modules/rrhh/domain/evolucion.ts (horasNormales + he50 +
 *     he100 + fer + comp), filtrado a los centros de costo "Seguridad Privada" (excluye "Seguridad Planta", que
 *     no es lo mismo). <7% de diferencia en todos los meses con dato.
 *   - Sueldos y cargas (tot.mo): HECHO. Sale de backend/src/modules/rrhh/domain/costosNomina.ts (`costoLaboral` +
 *     `prov`, sumados por centro de costo y mes). `prov` son las provisiones de aguinaldo y despidos: sin
 *     sumarlas, el número queda sistemáticamente ~5-6% por debajo de lo que ya tenía el tablero (se probó
 *     primero con `costoLaboral` solo); sumando `prov` (lo que hace leer-rrhh.mjs) el error medio baja a ~1,2%,
 *     y queda por debajo del 1% en 19 de 23 meses. Los primeros 5 meses con dato (nov-2024 a mar-2025) quedan
 *     entre 1% y 5% por ARRIBA del valor conocido, sin una causa puntual identificada (no se investigó más
 *     porque ya es una diferencia chica); el resto, desde abr-2025, es prácticamente exacto.
 *   - Otros gastos del servicio (tot.otros) y gastos generales (tot.est): BLOQUEADOS. Se probó reconstruir
 *     "otros gastos" con la clasificación oficial de rubro/subrubro del plan de cuentas de Vientri
 *     (sql/gastos_seguridad.sql): da entre 15% y 180% del valor conocido según qué rubros se incluyan, nunca
 *     cierra. La razón identificada: una parte de ese gasto es la flota propia de Seguridad, y esa flota NO se
 *     contabiliza únicamente en el centro de costo "SERVICIO DE SEGURIDAD PRIVADA" — 5 vehículos sí están
 *     asignados ahí directamente en Vientri (OBJETOSERVICIO.IDCCOSTO: un VW Gol, un VW Fox, un cuatriciclo
 *     Zanella, una Renault Kangoo y un Renault Sandero), pero la lista real de "vehículos de Seguridad
 *     confirmados por Sistemas" que ya usaba el tablero (dentro del propio JSON, `flotaSP.veh`) tiene 14
 *     vehículos y varios están marcados ahí mismo como "no registrado en Vientri": no es algo que se pueda sacar
 *     de Vientri ni de Bacarnet. Mezclar el gasto directo de esos 5 con una estimación proporcional del resto
 *     (con el `frac` que ya trae el tablero) sobrestima el número, y además hay un mes (jun-2025) con un asiento
 *     de ajuste por inflación que distorsiona cualquier cálculo mensual de esa cuenta. No se encontró una forma
 *     de cerrar esto sin inventar una regla nueva: decisión del usuario, no de este script, si quiere conseguir
 *     la lista completa de vehículos de quien se la pasó. "Gastos generales" tampoco se puede calcular porque
 *     depende, además, de los sueldos de las áreas de apoyo (mismo tipo de dato que tot.mo, pero de otros
 *     centros de costo).
 *
 * Métodos usados (todos validados contra los meses que ya tenía el tablero):
 *
 *   Facturación = suma de NETO de facturas (FAA, FAB, CFA) con id_unegocio = 1 ("SERVICIO DE SEGURIDAD") menos la
 *   suma de NETO de notas de crédito (NCA, NCB, CCA) del mismo id_unegocio, agrupado por mes de FEC_CMP (columna
 *   `fecha` de comprobantes.csv).
 *
 *   Ingresos Brutos = suma de (DEBE - HABER) de las cuentas del rubro "EGRESOS / CARGAS TRIBUTARIAS" (Impuesto a
 *   los Ingresos Brutos, Tasa de Comercio e Industria, multas e impuestos varios) del centro de costo "SERVICIO DE
 *   SEGURIDAD PRIVADA", agrupado por mes de la cabecera del asiento (columna `mes` de gastos_seguridad.csv). Un
 *   mes en 0 se trata como "la contabilidad de ese mes todavía no cerró" y se deja el valor que ya tenía el
 *   tablero.
 *
 *   Horas facturadas = para cada renglón "SERVICIO DE SEGURIDAD PRIVADA" de ventas_items.csv de los clientes de
 *   Seguridad (la lista de clientes ya la tiene el propio tablero, en `datos.cli`), se suma la cantidad (horas)
 *   con signo según el tipo de comprobante (+factura, -nota de crédito), agrupado por el MES DE FACTURACIÓN
 *   (igual que hace el tablero viejo: las facturas del día 1 al 7 cuentan como del mes anterior). Eso da la
 *   tarifa promedio $/hora de cada mes (importe facturado ÷ horas). A esas horas se les suma el monto "fijo"
 *   (abono mensual) de CADA cliente de ese mismo mes, convertido a horas-equivalente con esa tarifa promedio:
 *   la idea de que la tarifa real está en Vientri (en el precio unitario con el que ya facturan los clientes "por
 *   hora") funciona. Da ~4% de diferencia en 22 de 23 meses con dato; el único mes raro (jul-2025) ya tenía una
 *   anomalía puntual en los datos de ese mes (se puede ver comparando `q` contra `hs` de cualquier cliente "por
 *   hora" en ese mes en el propio `datos.cli` del tablero) y no es un problema del método.
 *
 *   Sueldos/cargas y horas pagadas = ver más arriba; se leen de un JSON ya agregado (--rrhh), generado aparte con
 *   scripts/tablero-seguridad-privada/leer-rrhh.mjs (lee Firestore de producción, requiere permiso explícito:
 *   tiene sueldos reales, aunque sea agregado por centro de costo y no por persona).
 *
 * Uso:
 *   node actualizar-facturacion.mjs --comprobantes <comprobantes.csv> --html <index.html> --out <salida.html> \
 *     [--gastos <gastos_seguridad.csv>] [--items <ventas_items.csv>] [--rrhh <rrhh_seguridad.json>]
 *
 *   Los tres flags opcionales son independientes entre sí: sin --gastos no se toca tot.iibb, sin --items no se
 *   toca tot.hf, sin --rrhh no se tocan tot.mo ni tot.hp.
 *   --gastos se genera con sql/gastos_seguridad.sql (en esta misma carpeta).
 *   --items con la consulta de producción D:\inventario_vientri\exportador\sql\11_ventas_items.sql (no se duplica
 *   acá: es una consulta de otro tablero, ver el comentario de scripts/vientri-export/exportar_vientri.ps1 sobre
 *   el rango 11-19).
 *   --rrhh con scripts/tablero-seguridad-privada/leer-rrhh.mjs (requiere la service account de RRHH y permiso
 *   para leer Firestore de producción).
 *
 * No escribe en Drive ni en ningún otro lado: deja el HTML nuevo en --out para que alguien lo revise y lo suba.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ID_UNEGOCIO_SEGURIDAD = '1'
const TIPOS_FACTURA = new Set(['FAA', 'FAB', 'CFA'])
const TIPOS_NOTA_CREDITO = new Set(['NCA', 'NCB', 'CCA'])
const RUBRO_IIBB = 'EGRESOS'
const SUBRUBRO_IIBB = 'CARGAS TRIBUTARIAS'
const ARTICULO_HORA_SEGURIDAD = 'SERVICIO DE SEGURIDAD PRIVADA'

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

/** Mismo criterio que usa el tablero viejo: las facturas del 1 al 7 cuentan como del mes anterior. */
function mesDeFacturacion(fecha) {
  let anio = Number(fecha.slice(0, 4))
  let mes = Number(fecha.slice(5, 7))
  const dia = Number(fecha.slice(8, 10))
  if (dia <= 7) {
    mes -= 1
    if (mes === 0) {
      mes = 12
      anio -= 1
    }
  }
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`
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

/** { 'YYYY-MM': horas } de Seguridad: horas facturadas "por hora" más el monto "fijo" de cada cliente convertido
 * a horas-equivalente con la tarifa promedio ($/hora) de ese mes. `clientesSeguridad` es `datos.cli`, `meses` es
 * `datos.meses` (mismo orden e índice que los arrays `s.fijo` de cada cliente). */
function calcularHorasFacturadasMensual(filasItems, mapaTipoComprobante, clientesSeguridad, meses) {
  const idsClientes = new Set(clientesSeguridad.map((c) => String(c.id)))
  const horasPorMes = new Map()
  const importePorMes = new Map()

  for (const fila of filasItems) {
    if (!idsClientes.has(fila.id_persona)) continue
    if (fila.articulo !== ARTICULO_HORA_SEGURIDAD) continue
    const tipo = mapaTipoComprobante.get(fila.id_comprobante)
    const esFactura = TIPOS_FACTURA.has(tipo)
    const esNotaCredito = TIPOS_NOTA_CREDITO.has(tipo)
    if (!esFactura && !esNotaCredito) continue
    const fecha = fila.fecha || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
    const mes = mesDeFacturacion(fecha)
    const cantidad = Number(fila.cantidad)
    const precio = Number(fila.precio_unitario_neto)
    if (!Number.isFinite(cantidad) || !Number.isFinite(precio)) continue
    const signo = esFactura ? 1 : -1
    horasPorMes.set(mes, (horasPorMes.get(mes) ?? 0) + signo * cantidad)
    importePorMes.set(mes, (importePorMes.get(mes) ?? 0) + signo * cantidad * precio)
  }

  // Monto "fijo" (abono) de cada cliente, convertido a horas-equivalente con la tarifa promedio del mismo mes.
  for (const cliente of clientesSeguridad) {
    const fijoPorMes = cliente.s?.fijo
    if (!Array.isArray(fijoPorMes)) continue
    cliente.s.fijo.forEach((fijo, i) => {
      if (!fijo) return
      const mes = meses[i]
      const tarifa = horasPorMes.get(mes) ? importePorMes.get(mes) / horasPorMes.get(mes) : null
      if (!tarifa) return
      horasPorMes.set(mes, (horasPorMes.get(mes) ?? 0) + fijo / tarifa)
    })
  }

  return horasPorMes
}

/** Convierte el JSON de leer-rrhh.mjs ({ horasPorMes, costoPorMes } con claves "AAAAMM") a dos Map con claves
 * "AAAA-MM" (el formato de `datos.meses`), listas para aplicarValores. */
function convertirRrhh(rrhh) {
  const aMapa = (obj) => {
    const mapa = new Map()
    for (const [clave, valor] of Object.entries(obj ?? {})) {
      if (!/^\d{6}$/.test(clave)) continue
      mapa.set(`${clave.slice(0, 4)}-${clave.slice(4, 6)}`, valor)
    }
    return mapa
  }
  return { horasPagadas: aMapa(rrhh.horasPorMes), sueldosYCargas: aMapa(rrhh.costoPorMes) }
}

/** Reemplaza `datos.tot[campo][i]` por el valor de `porMes` para cada mes que tenga dato nuevo; deja el resto igual.
 * Si el ÚLTIMO mes de la serie da menos del 20% del promedio de los demás meses con dato, se trata como "sin dato
 * nuevo" (se deja el valor que ya tenía) en vez de aplicarlo: casi siempre es que la contabilidad de ese mes
 * todavía no cerró del todo (visto en vivo con Ingresos Brutos de 2026-09: dio ~$5.700 contra ~$100-120M de los
 * meses anteriores). Esto corre automático sin revisión manual, así que no alcanza con avisar "revisar a mano": si
 * no se frena acá, el tablero mostraría un número engañoso hasta que alguien lo note. Para un mes que NO es el
 * último de la serie, en cambio, solo se avisa (ahí un valor bajo puede ser real, no un cierre pendiente). */
function aplicarValores(datos, campo, porMes, etiqueta, { decimales = 0 } = {}) {
  let actualizados = 0
  const sinDatoNuevo = []
  const nuevos = [...porMes.values()]
  const promedio = nuevos.length > 0 ? nuevos.reduce((a, b) => a + b, 0) / nuevos.length : 0
  const sospechosos = []
  const frenados = []
  const ultimoMes = datos.meses[datos.meses.length - 1]
  datos.meses.forEach((mes, i) => {
    if (porMes.has(mes)) {
      const nuevoCrudo = porMes.get(mes)
      const esUltimoMes = mes === ultimoMes
      const esMuyChico = promedio > 0 && Math.abs(nuevoCrudo) < promedio * 0.2
      if (esUltimoMes && esMuyChico) {
        frenados.push(mes)
        return
      }
      const anterior = datos.tot[campo][i]
      const factor = 10 ** decimales
      const nuevo = Math.round(nuevoCrudo * factor) / factor
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
  if (frenados.length > 0) {
    console.log(
      `  ${etiqueta}: FRENADO el último mes por valor demasiado chico (probable contabilidad sin cerrar, se deja el valor anterior): ${frenados.join(', ')}`,
    )
  }
  if (sospechosos.length > 0) {
    console.log(
      `  ${etiqueta}: OJO, estos meses (no el último) dieron un valor mucho más chico que el resto (revisar a mano): ${sospechosos.join(', ')}`,
    )
  }
  console.log(`  ${etiqueta}: ${actualizados} de ${datos.meses.length} meses con valor distinto al que tenía el tablero.`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.comprobantes || !args.html || !args.out) {
    console.error(
      'Uso: node actualizar-facturacion.mjs --comprobantes <csv> --html <index.html> --out <salida.html> [--gastos <gastos_seguridad.csv>] [--items <ventas_items.csv>] [--rrhh <rrhh_seguridad.json>]',
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
  if (
    !Array.isArray(datos.meses) ||
    !datos.tot ||
    !Array.isArray(datos.tot.fact) ||
    !Array.isArray(datos.tot.iibb) ||
    !Array.isArray(datos.tot.hf) ||
    !Array.isArray(datos.tot.mo) ||
    !Array.isArray(datos.tot.hp) ||
    !Array.isArray(datos.cli)
  ) {
    throw new Error('La forma del JSON embebido cambió (meses/tot.fact/tot.iibb/tot.hf/tot.mo/tot.hp/cli): revisar antes de seguir')
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

  if (args.items) {
    const mapaTipoComprobante = new Map(filasComprobantes.map((f) => [f.vientri_id, f.nom_tipo]))
    const filasItems = parseCsv(readFileSync(args.items, 'utf8'))
    console.log(`Renglones de factura leídos: ${filasItems.length}.`)
    aplicarValores(
      datos,
      'hf',
      calcularHorasFacturadasMensual(filasItems, mapaTipoComprobante, datos.cli, datos.meses),
      'Horas facturadas',
      { decimales: 1 },
    )
  } else {
    console.log('  Horas facturadas: no se pasó --items, queda sin tocar.')
  }

  if (args.rrhh) {
    const rrhh = JSON.parse(readFileSync(args.rrhh, 'utf8'))
    const { horasPagadas, sueldosYCargas } = convertirRrhh(rrhh)
    console.log(`RRHH leído: ${rrhh.meses?.length ?? 0} meses, centros de costo ${JSON.stringify(rrhh.segCcs ?? [])}.`)
    aplicarValores(datos, 'hp', horasPagadas, 'Horas pagadas', { decimales: 1 })
    aplicarValores(datos, 'mo', sueldosYCargas, 'Sueldos y cargas')
  } else {
    console.log('  Horas pagadas y sueldos y cargas: no se pasó --rrhh, quedan sin tocar.')
  }

  const nuevoBloque = JSON.stringify(datos)
  const nuevoHtml = html.slice(0, inicioJson) + nuevoBloque + html.slice(finJson)
  writeFileSync(args.out, nuevoHtml, 'utf8')
  console.log(`Escrito: ${args.out} (${nuevoHtml.length} caracteres, original tenía ${html.length}).`)
}

main()
