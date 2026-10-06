import { createReadStream, readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResultadoResumen } from '../domain/resumenMensual.js'
import type { BackupSalario } from './backupsDrive.js'
import {
  ejecutarIngestaRrhh,
  idIngesta,
  motivoParaNoGuardar,
  VENCIMIENTO_EN_CURSO_MS,
  type DatosFinIngesta,
  type DatosInicioIngesta,
  type DependenciasIngesta,
  type RegistroIngestas,
  type UltimaIngestaOk,
} from './ingesta.service.js'


const MUESTRA = join(__dirname, '..', 'domain', '__fixtures__', 'salario-muestra.sql')
const AHORA = new Date('2026-10-06T18:30:00Z')

const BACKUP: BackupSalario = {
  id: 'archivo-1',
  nombre: 'Backup_lun.0510202620300131.sql',
  bytes: 1234,
  md5: 'abc123',
  creado: '2026-10-06T17:17:00Z',
}

class RegistroEnMemoria implements RegistroIngestas {
  docs = new Map<string, { estado: string; inicio: Date; fin?: DatosFinIngesta }>()
  sinBackup = 0

  async tomar(id: string, datos: DatosInicioIngesta, opciones: { forzar: boolean; vencimientoMs: number }) {
    const previo = this.docs.get(id)
    if (previo?.estado === 'ok' && !opciones.forzar) return 'ya_procesado' as const
    if (previo?.estado === 'en_curso' && datos.inicio.getTime() - previo.inicio.getTime() < opciones.vencimientoMs) {
      return 'en_curso' as const
    }
    this.docs.set(id, { estado: 'en_curso', inicio: datos.inicio })
    return 'tomada' as const
  }

  async terminar(id: string, datos: DatosFinIngesta) {
    const doc = this.docs.get(id)!
    doc.estado = datos.estado
    doc.fin = datos
  }

  async registrarSinBackup() {
    this.sinBackup += 1
  }
}

function dependencias(overrides: Partial<DependenciasIngesta> = {}) {
  const registro = new RegistroEnMemoria()
  const guardados: ResultadoResumen[] = []
  const deps: DependenciasIngesta = {
    buscarUltimoBackup: async () => BACKUP,
    abrirBackup: async () => createReadStream(MUESTRA),
    guardarResultado: async (resultado) => {
      guardados.push(resultado)
      return { resumenes: resultado.centrosCosto.length, personas: resultado.personas.length, borrados: 0 }
    },
    registro,
    ultimaIngestaOk: async () => null,
    ahora: () => AHORA,
    ...overrides,
  }
  return { deps, registro, guardados }
}

const MANUAL = { origen: 'manual' as const, actorUid: 'uid-1' }

describe('ejecutarIngestaRrhh', () => {
  it('procesa el último backup y deja registro ok', async () => {
    const { deps, registro, guardados } = dependencias()
    const r = await ejecutarIngestaRrhh(deps, MANUAL)
    expect(r).toMatchObject({ estado: 'ok', ultimoMes: '202609', backupAtrasado: false })
    expect(r.escritura).toEqual({ resumenes: 4, personas: 3, borrados: 0 })
    expect(guardados).toHaveLength(1)
    const doc = registro.docs.get(idIngesta(BACKUP))!
    expect(doc.estado).toBe('ok')
    expect(doc.fin?.filasPorTabla).toEqual({ empleado: 3, liq2026: 19, tablas: 7, vac: 3 })
    expect(doc.fin?.anomalias).toBe(2)
  })

  it('no reprocesa el mismo archivo, salvo que se fuerce', async () => {
    const { deps, guardados } = dependencias()
    await ejecutarIngestaRrhh(deps, MANUAL)
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).estado).toBe('ya_procesado')
    expect(guardados).toHaveLength(1)
    expect((await ejecutarIngestaRrhh(deps, { ...MANUAL, forzar: true })).estado).toBe('ok')
    expect(guardados).toHaveLength(2)
  })

  it('no corre dos veces a la vez, pero retoma una corrida vencida', async () => {
    const { deps, registro } = dependencias()
    registro.docs.set(idIngesta(BACKUP), { estado: 'en_curso', inicio: new Date(AHORA.getTime() - 60_000) })
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).estado).toBe('en_curso')
    registro.docs.set(idIngesta(BACKUP), {
      estado: 'en_curso',
      inicio: new Date(AHORA.getTime() - VENCIMIENTO_EN_CURSO_MS - 1),
    })
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).estado).toBe('ok')
  })

  it('avisa cuando no hay backup', async () => {
    const { deps, registro } = dependencias({ buscarUltimoBackup: async () => null })
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).estado).toBe('sin_backup')
    expect(registro.sinBackup).toBe(1)
  })

  it('marca el backup atrasado si tiene más de 14 horas', async () => {
    const { deps } = dependencias({
      buscarUltimoBackup: async () => ({ ...BACKUP, creado: '2026-10-05T23:00:00Z' }),
    })
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).backupAtrasado).toBe(true)
  })

  it('registra el error y no guarda nada si el archivo falla', async () => {
    const { deps, registro, guardados } = dependencias({
      abrirBackup: async () => {
        throw new Error('Drive no respondió')
      },
    })
    const r = await ejecutarIngestaRrhh(deps, MANUAL)
    expect(r).toMatchObject({ estado: 'error', mensaje: 'Drive no respondió' })
    expect(guardados).toHaveLength(0)
    expect(registro.docs.get(idIngesta(BACKUP))!.estado).toBe('error')
  })
})

describe('guardas contra backups incompletos', () => {
  const contenido = readFileSync(MUESTRA, 'utf8')

  it('no guarda nada si el dump llegó cortado (sin "-- Dump completed")', async () => {
    const cortado = contenido.split('-- Dump completed')[0]
    const { deps, registro, guardados } = dependencias({ abrirBackup: async () => Readable.from([cortado]) })
    const r = await ejecutarIngestaRrhh(deps, MANUAL)
    expect(r.estado).toBe('error')
    expect(r.mensaje).toContain('incompleto')
    expect(guardados).toHaveLength(0)
    expect(registro.docs.get(idIngesta(BACKUP))!.estado).toBe('error')
  })

  it('no guarda nada si el backup llega hasta un mes anterior a la última ingesta buena', async () => {
    const anterior: UltimaIngestaOk = { ultimoMes: '202610', filasPorTabla: {} }
    const { deps, guardados } = dependencias({ ultimaIngestaOk: async () => anterior })
    const r = await ejecutarIngestaRrhh(deps, MANUAL)
    expect(r.estado).toBe('error')
    expect(r.mensaje).toContain('202609')
    expect(guardados).toHaveLength(0)
  })

  it('no guarda nada si una tabla de liquidaciones trae muchas menos filas', async () => {
    const anterior: UltimaIngestaOk = { ultimoMes: '202609', filasPorTabla: { liq2026: 100 } }
    const { deps, guardados } = dependencias({ ultimaIngestaOk: async () => anterior })
    const r = await ejecutarIngestaRrhh(deps, MANUAL)
    expect(r.estado).toBe('error')
    expect(r.mensaje).toContain('liq2026')
    expect(guardados).toHaveLength(0)
  })

  it('guarda si las filas se mantienen y pasa las filas por tabla al guardado', async () => {
    const anterior: UltimaIngestaOk = { ultimoMes: '202608', filasPorTabla: { liq2026: 19, liq2023: 5000 } }
    let filasGuardadas: Record<string, number> | undefined
    const { deps } = dependencias({
      ultimaIngestaOk: async () => anterior,
      guardarResultado: async (resultado, info) => {
        filasGuardadas = info.filasPorTabla
        return { resumenes: resultado.centrosCosto.length, personas: resultado.personas.length, borrados: 0 }
      },
    })
    expect((await ejecutarIngestaRrhh(deps, MANUAL)).estado).toBe('ok')
    expect(filasGuardadas).toEqual({ empleado: 3, liq2026: 19, tablas: 7, vac: 3 })
  })

  it('ignora tablas de años que quedaron fuera de la ventana (cambio de año)', () => {
    const motivo = motivoParaNoGuardar(
      { completo: true, ultimoMes: '202701', filasPorTabla: { liq2026: 800000, liq2027: 60000 } },
      { ultimoMes: '202612', filasPorTabla: { liq2024: 640000, liq2025: 830000, liq2026: 790000 } },
      2025,
    )
    expect(motivo).toContain('liq2025')
    expect(
      motivoParaNoGuardar(
        { completo: true, ultimoMes: '202701', filasPorTabla: { liq2025: 830000, liq2026: 800000 } },
        { ultimoMes: '202612', filasPorTabla: { liq2024: 640000, liq2025: 830000, liq2026: 790000 } },
        2025,
      ),
    ).toBeNull()
  })
})
