import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { leerDumpMysql, parsearTuplas, type FilaDump, type ValorDump } from './sqlDumpParser.js'

function tuplas(texto: string): ValorDump[][] {
  const out: ValorDump[][] = []
  parsearTuplas(texto, 0, (v) => out.push(v))
  return out
}

describe('parsearTuplas', () => {
  it('lee números, NULL y textos', () => {
    expect(tuplas("(1,'a',NULL,-2.50),(2,'',3);")).toEqual([
      ['1', 'a', null, '-2.50'],
      ['2', '', '3'],
    ])
  })

  it('respeta los escapes de MySQL dentro de los textos', () => {
    expect(tuplas("('O\\'Neil','a\\\\b','x\\ny','\"c\"','d''e','coma, y (paréntesis)');")).toEqual([
      ["O'Neil", 'a\\b', 'x\ny', '"c"', "d'e", 'coma, y (paréntesis)'],
    ])
  })

  it('falla con un texto sin cerrar', () => {
    expect(() => tuplas("('abierto);")).toThrow('Texto sin cerrar')
  })
})

const DUMP = [
  '-- MySQL dump 10.13  Distrib 5.7.43, for Win64 (x86_64)',
  'CREATE TABLE `uno` (',
  "  `A` int(11) NOT NULL DEFAULT '0',",
  "  `B` varchar(10) NOT NULL DEFAULT ' ',",
  '  KEY `IDX` (`A`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=latin1;',
  "INSERT INTO `uno` VALUES (1,'x'),(2,'y');",
  'CREATE TABLE `otra` (',
  "  `Z` int(11) NOT NULL DEFAULT '0'",
  ') ENGINE=InnoDB DEFAULT CHARSET=latin1;',
  'INSERT INTO `otra` VALUES (9);',
  "INSERT INTO `uno` VALUES (3,'z');",
]

async function leer(texto: string, tablas: string[]) {
  const filas: [string, FilaDump][] = []
  const res = await leerDumpMysql(Readable.from([texto]), {
    quiereTabla: (t) => tablas.includes(t),
    onFila: (t, f) => filas.push([t, f]),
  })
  return { filas, res }
}

describe('leerDumpMysql', () => {
  it('arma las filas con los nombres del CREATE TABLE y saltea las tablas no pedidas', async () => {
    const { filas, res } = await leer(DUMP.join('\n'), ['uno'])
    expect(filas).toEqual([
      ['uno', { A: '1', B: 'x' }],
      ['uno', { A: '2', B: 'y' }],
      ['uno', { A: '3', B: 'z' }],
    ])
    expect(res.filasPorTabla).toEqual({ uno: 3 })
    expect(res.encabezado).toBe('MySQL dump 10.13  Distrib 5.7.43, for Win64 (x86_64)')
  })

  it('funciona igual con fin de línea CRLF', async () => {
    const { filas } = await leer(DUMP.join('\r\n'), ['uno', 'otra'])
    expect(filas.map(([t]) => t)).toEqual(['uno', 'uno', 'otra', 'uno'])
    expect(filas[0][1]).toEqual({ A: '1', B: 'x' })
  })

  it('avisa si hay datos de una tabla pedida sin su CREATE TABLE', async () => {
    await expect(leer("INSERT INTO `uno` VALUES (1,'x');", ['uno'])).rejects.toThrow('sin su CREATE TABLE')
  })
})
