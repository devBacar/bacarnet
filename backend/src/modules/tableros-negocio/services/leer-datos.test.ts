import { beforeEach, describe, expect, it, vi } from 'vitest'

const drive = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}))

vi.mock('../../../lib/google/driveClient.js', () => ({
  getDrive: async () => ({ files: { list: drive.list, get: drive.get } }),
}))

import { DatosNegocioError, leerDatosNegocio, vaciarCacheDatosNegocio } from './leer-datos.js'

const datosFicticios = {
  meses: ['2026-01'],
  cuentas: [],
  ccs: [],
  cats: [],
  provs: [],
  costos: [],
  prov: [],
  lineasIng: {},
  clientes: [],
  compras: {},
  cobTot: {},
  dolar: {},
  cob: { deudaClientes: [], deudaProveedores: [], deudaImpuestos: [] },
  inversiones: [],
  inflacion: 0.3,
}

describe('leerDatosNegocio', () => {
  beforeEach(() => {
    vaciarCacheDatosNegocio()
    drive.list.mockReset()
    drive.get.mockReset()
    process.env.NEGOCIO_BOARD_FOLDER_ID = 'carpeta-negocio'
  })

  it('sin la carpeta configurada responde 503', async () => {
    process.env.NEGOCIO_BOARD_FOLDER_ID = ''
    await expect(leerDatosNegocio()).rejects.toMatchObject({ status: 503 })
  })

  it('sin datos.json responde 404', async () => {
    drive.list.mockResolvedValue({ data: { files: [] } })
    await expect(leerDatosNegocio()).rejects.toBeInstanceOf(DatosNegocioError)
    await expect(leerDatosNegocio()).rejects.toMatchObject({ status: 404 })
  })

  it('toma el más nuevo y cachea mientras no cambie modifiedTime', async () => {
    drive.list.mockResolvedValue({
      data: {
        files: [
          { id: 'viejo', modifiedTime: '2026-10-01T10:00:00.000Z' },
          { id: 'nuevo', modifiedTime: '2026-10-15T10:00:00.000Z' },
        ],
      },
    })
    drive.get.mockResolvedValue({ data: JSON.stringify(datosFicticios) })
    const a = await leerDatosNegocio()
    const b = await leerDatosNegocio()
    expect(a.actualizado).toBe('2026-10-15T10:00:00.000Z')
    expect(b.datos).toEqual(datosFicticios)
    expect(drive.get).toHaveBeenCalledTimes(1)
    expect(drive.get.mock.calls[0][0]).toMatchObject({ fileId: 'nuevo', alt: 'media' })
  })

  it('vuelve a descargar si cambió modifiedTime', async () => {
    drive.get.mockResolvedValue({ data: JSON.stringify(datosFicticios) })
    drive.list.mockResolvedValueOnce({ data: { files: [{ id: 'a', modifiedTime: '2026-10-01T00:00:00.000Z' }] } })
    await leerDatosNegocio()
    drive.list.mockResolvedValueOnce({ data: { files: [{ id: 'a', modifiedTime: '2026-10-02T00:00:00.000Z' }] } })
    await leerDatosNegocio()
    expect(drive.get).toHaveBeenCalledTimes(2)
  })

  it('JSON roto o con forma inválida responde 422', async () => {
    drive.list.mockResolvedValue({ data: { files: [{ id: 'a', modifiedTime: '2026-10-01T00:00:00.000Z' }] } })
    drive.get.mockResolvedValueOnce({ data: '{no es json' })
    await expect(leerDatosNegocio()).rejects.toMatchObject({ status: 422 })
    drive.get.mockResolvedValueOnce({ data: JSON.stringify({ meses: [] }) })
    await expect(leerDatosNegocio()).rejects.toMatchObject({ status: 422 })
  })
})
