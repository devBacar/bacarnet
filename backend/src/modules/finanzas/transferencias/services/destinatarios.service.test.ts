import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createDestinatarioDocument,
  updateDestinatarioDocument,
  getDestinatarioDocument,
  listDestinatarioDocuments,
  registrarUsoDestinatarioDocument,
  deleteDestinatarioDocument,
  listTransferenciasConfeccionadas,
  DestinatarioDuplicadoError,
} = vi.hoisted(() => {
  class DestinatarioDuplicadoError extends Error {
    constructor() {
      super('Ese CBU ya está en la agenda')
      this.name = 'DestinatarioDuplicadoError'
    }
  }
  return {
    createDestinatarioDocument: vi.fn(),
    updateDestinatarioDocument: vi.fn(),
    getDestinatarioDocument: vi.fn(),
    listDestinatarioDocuments: vi.fn(),
    registrarUsoDestinatarioDocument: vi.fn(),
    deleteDestinatarioDocument: vi.fn(),
    listTransferenciasConfeccionadas: vi.fn(),
    DestinatarioDuplicadoError,
  }
})

vi.mock('./destinatarios.repository.js', () => ({
  createDestinatarioDocument,
  updateDestinatarioDocument,
  getDestinatarioDocument,
  listDestinatarioDocuments,
  registrarUsoDestinatarioDocument,
  deleteDestinatarioDocument,
  DestinatarioDuplicadoError,
}))

vi.mock('./transferencias.repository.js', () => ({
  listTransferenciasConfeccionadas,
}))

vi.mock('../../agenda/services/agenda.repository.js', () => ({
  getCompromisoDocument: vi.fn(),
}))

import {
  actualizarDestinatarioApi,
  crearDestinatarioApi,
  listDestinatariosApi,
  registrarUsoDestinatario,
} from './destinatarios.service.js'

const CBU = '3050001101010001303450'

function documento(partial: Record<string, unknown> = {}) {
  return {
    nombre: 'Acme SA',
    cbu: CBU,
    cuit: null as string | null,
    alias: null as string | null,
    bancoNombre: 'Banco Julio',
    tipo: 'terceros' as const,
    usos: 1,
    ultimoUsoAt: { toDate: () => new Date('2026-09-29T12:00:00.000Z') },
    createdAt: { toDate: () => new Date('2026-09-01T12:00:00.000Z') },
    createdBy: 'user-1',
    ...partial,
  }
}

describe('agenda de destinatarios y tipo de cuenta', () => {
  let guardado: ReturnType<typeof documento> | null

  beforeEach(() => {
    guardado = documento()
    vi.clearAllMocks()
    listDestinatarioDocuments.mockImplementation(async () =>
      guardado ? [{ id: CBU, data: guardado }] : [],
    )
    getDestinatarioDocument.mockImplementation(async () =>
      guardado ? { id: CBU, data: guardado } : null,
    )
    createDestinatarioDocument.mockImplementation(async (input: Record<string, unknown>) => {
      guardado = documento({
        nombre: input.nombre,
        cbu: input.cbu,
        cuit: input.cuit,
        alias: input.alias,
        tipo: input.tipo,
        tipoCuenta: input.tipoCuenta,
        usos: 0,
        createdBy: input.actorUid,
      })
    })
    updateDestinatarioDocument.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
      guardado = documento({ ...(guardado ?? {}), ...patch })
    })
    registrarUsoDestinatarioDocument.mockResolvedValue('alta')
    listTransferenciasConfeccionadas.mockResolvedValue([])
    deleteDestinatarioDocument.mockResolvedValue(undefined)
  })

  it('un documento viejo sin tipoCuenta se lee como null', async () => {
    const listed = await listDestinatariosApi({})
    expect(listed.destinatarios[0]?.tipoCuenta).toBeNull()
  })

  it('el alta guarda CC o CA y rechaza un tipo inválido', async () => {
    const creado = await crearDestinatarioApi({
      actorUid: 'user-1',
      body: { nombre: 'Acme SA', cbu: CBU, tipo: 'proveedores', tipoCuenta: 'CA' },
    })
    expect(createDestinatarioDocument).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'proveedores', tipoCuenta: 'CA', cbu: CBU }),
    )
    expect(creado.destinatario.tipoCuenta).toBe('CA')

    createDestinatarioDocument.mockClear()
    const sinTipo = await crearDestinatarioApi({
      actorUid: 'user-1',
      body: { nombre: 'Acme SA', cbu: CBU, tipo: 'terceros' },
    })
    expect(createDestinatarioDocument).toHaveBeenCalledWith(expect.objectContaining({ tipoCuenta: null }))
    expect(sinTipo.destinatario.tipoCuenta).toBeNull()

    createDestinatarioDocument.mockClear()
    await expect(
      crearDestinatarioApi({
        actorUid: 'user-1',
        body: { nombre: 'Acme SA', cbu: CBU, tipo: 'terceros', tipoCuenta: 'XX' },
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cuenta corriente o caja de ahorro/) })
    expect(createDestinatarioDocument).not.toHaveBeenCalled()
  })

  it('el PATCH actualiza el tipo de cuenta y rechaza un valor inválido', async () => {
    const actualizado = await actualizarDestinatarioApi({
      id: CBU,
      body: { tipoCuenta: 'CC' },
    })
    expect(updateDestinatarioDocument).toHaveBeenCalledWith(CBU, { tipoCuenta: 'CC' })
    expect(actualizado.destinatario.tipoCuenta).toBe('CC')

    updateDestinatarioDocument.mockClear()
    await expect(
      actualizarDestinatarioApi({ id: CBU, body: { tipoCuenta: 'caja de ahorro' } }),
    ).rejects.toMatchObject({ status: 400 })
    expect(updateDestinatarioDocument).not.toHaveBeenCalled()
  })

  it('al confeccionar da de alta o actualiza el tipo elegido', async () => {
    await expect(
      registrarUsoDestinatario({
        nombre: 'Acme SA',
        cbu: CBU,
        cuit: null,
        tipo: 'proveedores',
        tipoCuenta: 'CA',
        actorUid: 'user-1',
      }),
    ).resolves.toBe('alta')
    expect(registrarUsoDestinatarioDocument).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'proveedores', tipoCuenta: 'CA', cbu: CBU }),
    )

    registrarUsoDestinatarioDocument.mockResolvedValue('suma')
    await expect(
      registrarUsoDestinatario({
        nombre: 'Acme SA',
        cbu: CBU,
        cuit: '20123456786',
        tipo: 'terceros',
        tipoCuenta: 'CC',
        actorUid: 'user-1',
      }),
    ).resolves.toBe('suma')
    expect(registrarUsoDestinatarioDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipoCuenta: 'CC', tipo: 'terceros' }),
    )
  })
})
