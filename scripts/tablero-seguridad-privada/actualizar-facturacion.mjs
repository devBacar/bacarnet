#!/usr/bin/env node
/**
 * Tablero "Seguridad Privada" (HTML estático en Drive, carpeta Tableros Gerencia > Financiero > Seguridad Privada):
 * recalcula SOLO la facturación mensual de Seguridad (tot.fact) con datos frescos de Vientri y la reemplaza dentro
 * del JSON embebido en el index.html, sin tocar ninguna otra sección del informe.
 *
 * Por qué solo facturación: las otras secciones del Fase-1 acordado (horas trabajadas/marcadas/pagadas, sueldos y
 * cargas, y por lo tanto el "resultado") dependen del sistema de Sueldos (Salario), que hoy NO está integrado a
 * Bacarnet (no existe ningún módulo rrhh/salario mergeado en main). Sin esos datos no hay forma de recalcular eso
 * sin inventar números, así que quedan tal cual estaban en el HTML hasta que exista esa fuente.
 *
 * Método (validado contra los 24 meses que ya tenía el tablero, <2% de diferencia en 22 de 24):
 *   Facturación de Seguridad en un mes = suma de NETO de facturas (FAA, FAB, CFA) con id_unegocio = 1
 *   ("SERVICIO DE SEGURIDAD") menos la suma de NETO de notas de crédito (NCA, NCB, CCA) del mismo id_unegocio,
 *   agrupado por mes de FEC_CMP (columna `fecha` del export).
 *
 * Uso:
 *   node actualizar-facturacion.mjs --comprobantes <ruta a comprobantes.csv> --html <ruta a index.html> --out <ruta de salida>
 *
 * No escribe en Drive ni en ningún otro lado: deja el HTML nuevo en --out para que alguien lo revise y lo suba.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ID_UNEGOCIO_SEGURIDAD = '1'
const TIPOS_FACTURA = new Set(['FAA', 'FAB', 'CFA'])
const TIPOS_NOTA_CREDITO = new Set(['NCA', 'NCB', 'CCA'])

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
 * columnas que usamos acá (fecha, montos, códigos) nunca llevan comillas. */
function parseCsv(texto) {
  const lineas = texto.split('\n').filter((l) => l.length > 0)
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

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.comprobantes || !args.html || !args.out) {
    console.error('Uso: node actualizar-facturacion.mjs --comprobantes <csv> --html <index.html> --out <salida.html>')
    process.exit(1)
  }

  const comprobantesTexto = readFileSync(args.comprobantes, 'utf8')
  const filas = parseCsv(comprobantesTexto)
  const facturacionPorMes = calcularFacturacionMensual(filas)
  console.log(`Comprobantes leídos: ${filas.length}. Meses con facturación de Seguridad recalculada: ${facturacionPorMes.size}.`)

  const html = readFileSync(args.html, 'utf8')
  const inicioTag = '<script type="application/json" id="datos">'
  const inicio = html.indexOf(inicioTag)
  if (inicio < 0) throw new Error('No encontré <script type="application/json" id="datos"> en el HTML')
  const inicioJson = inicio + inicioTag.length
  const finJson = html.indexOf('</script>', inicioJson)
  if (finJson < 0) throw new Error('No encontré el cierre </script> del bloque de datos')

  const datos = JSON.parse(html.slice(inicioJson, finJson))
  if (!Array.isArray(datos.meses) || !datos.tot || !Array.isArray(datos.tot.fact)) {
    throw new Error('La forma del JSON embebido cambió (meses/tot.fact): revisar antes de seguir')
  }

  let actualizados = 0
  const sinDatoNuevo = []
  datos.meses.forEach((mes, i) => {
    if (facturacionPorMes.has(mes)) {
      const anterior = datos.tot.fact[i]
      const nuevo = Math.round(facturacionPorMes.get(mes))
      if (nuevo !== anterior) actualizados += 1
      datos.tot.fact[i] = nuevo
    } else {
      sinDatoNuevo.push(mes)
    }
  })

  if (sinDatoNuevo.length > 0) {
    console.log(
      `Meses sin datos en este export (quedan con el valor que ya tenían, normalmente los más viejos fuera de la ventana de 2 años): ${sinDatoNuevo.join(', ')}`,
    )
  }
  console.log(`Meses con facturación distinta a la que tenía el tablero: ${actualizados} de ${datos.meses.length}.`)

  const nuevoBloque = JSON.stringify(datos)
  const nuevoHtml = html.slice(0, inicioJson) + nuevoBloque + html.slice(finJson)
  writeFileSync(args.out, nuevoHtml, 'utf8')
  console.log(`Escrito: ${args.out} (${nuevoHtml.length} caracteres, original tenía ${html.length}).`)
}

main()
