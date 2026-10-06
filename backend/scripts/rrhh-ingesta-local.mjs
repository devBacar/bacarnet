#!/usr/bin/env node
/**
 * Lee un backup de Salario (.sql) local y muestra el resumen que arma el módulo RRHH, sin Drive.
 *
 * Uso (desde la raíz del repo):
 *   npm --prefix backend run build
 *   node backend/scripts/rrhh-ingesta-local.mjs --sql C:\ruta\Backup_xxx.sql
 *   node backend/scripts/rrhh-ingesta-local.mjs --sql C:\ruta\Backup_xxx.sql --escribir   (solo con emulador)
 *
 * --escribir guarda el resultado en Firestore y SOLO funciona con FIRESTORE_EMULATOR_HOST definido.
 * Nunca copies backups reales dentro del repo: tienen sueldos y datos de salud.
 */
import { createReadStream, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const iSql = args.indexOf('--sql')
const rutaSql = iSql >= 0 ? args[iSql + 1] : undefined
const escribir = args.includes('--escribir')

if (!rutaSql || !existsSync(rutaSql)) {
  console.error('Indicá un backup existente con --sql <ruta al .sql>')
  process.exit(1)
}
if (escribir && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('--escribir solo funciona contra el emulador: definí FIRESTORE_EMULATOR_HOST=127.0.0.1:8080')
  process.exit(1)
}

const { leerDumpMysql } = require('../lib/modules/rrhh/domain/sqlDumpParser.js')
const { AcumuladorSalario } = require('../lib/modules/rrhh/domain/resumenMensual.js')
const { MESES_HISTORIA } = require('../lib/modules/rrhh/services/ingesta.service.js')

const anio = new Date().getFullYear()
const inicio = Date.now()
const acumulador = new AcumuladorSalario({
  mesesHistoria: MESES_HISTORIA,
  anioDesde: anio - 2,
  vacacionesDesde: `${anio - 2}-01-01`,
})
const lectura = await leerDumpMysql(createReadStream(rutaSql), {
  quiereTabla: acumulador.quiereTabla,
  onFila: acumulador.onFila,
})
const r = acumulador.resultado()
const ultimo = r.centrosCosto.filter((c) => c.mes === r.ultimoMes)
const suma = (k) => Math.round(ultimo.reduce((s, c) => s + c.horas[k].hs, 0))

console.log(`Backup: ${lectura.encabezado}`)
console.log(`Leído en ${((Date.now() - inicio) / 1000).toFixed(1)} s · filas por tabla:`, lectura.filasPorTabla)
console.log(`Meses: ${r.meses[0]} a ${r.ultimoMes} (${r.meses.length}) · centros de costo por mes: ${r.centrosCosto.length} · legajos: ${r.personas.length}`)
console.log(`Último mes (${r.ultimoMes}): ${suma('he50')} h al 50%, ${suma('he100')} h al 100%, ${suma('fer')} h en feriado`)
console.log(`Horas mal cargadas descartadas: ${r.anomalias.length}`)

if (escribir) {
  const { guardarResultado } = require('../lib/modules/rrhh/services/rrhh.repository.js')
  const conteo = await guardarResultado(r, {
    ingestaId: 'local',
    archivo: rutaSql.split(/[\\/]/).pop(),
    backupCreado: new Date().toISOString(),
  })
  console.log('Guardado en el emulador:', conteo)
}
