import { beforeEach, describe, expect, it, vi } from 'vitest'

const grantBoardAccess = vi.hoisted(() => vi.fn())
const writeAuditLogBestEffort = vi.hoisted(() => vi.fn())
const store = vi.hoisted(() => new Map<string, Record<string, unknown> | null>())
const updates = vi.hoisted(() => [] as { path: string; patch: Record<string, unknown> }[])

vi.mock('../../config/env.js', () => ({
  getEnv: () => ({ allowedEmailDomain: 'bacarsa.com.ar' }),
  isEmailInAllowedDomain: (email: string, domain: string) =>
    email.trim().toLowerCase().endsWith(`@${domain}`),
}))

vi.mock('../../lib/log.js', () => ({
  logInfo: () => undefined,
  logError: () => undefined,
}))

vi.mock('../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
    }),
    runTransaction: async (fn: (tx: {
      get: (ref: { path: string }) => Promise<{
        exists: boolean
        data: () => Record<string, unknown>
        get: (field: string) => unknown
      }>
      update: (ref: { path: string }, patch: Record<string, unknown>) => void
    }) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const data = store.has(ref.path) ? store.get(ref.path) ?? null : null
          return {
            exists: data !== null,
            data: () => data ?? {},
            get: (field: string) => (data ? data[field] : undefined),
          }
        },
        update: (ref: { path: string }, patch: Record<string, unknown>) => {
          updates.push({ path: ref.path, patch })
        },
      }
      return fn(tx)
    },
  }),
}))

vi.mock('../boards/boardAccess.js', () => ({
  grantBoardAccess,
}))

vi.mock('../audit/writeAuditLog.js', () => ({
  writeAuditLogBestEffort,
}))

import { applyPendingUserSetupForNewUser } from './applyPendingUserSetup.js'

function userPatch() {
  return updates.find((row) => row.path.startsWith('users/'))?.patch
}

beforeEach(() => {
  store.clear()
  updates.length = 0
  grantBoardAccess.mockReset()
  writeAuditLogBestEffort.mockReset()
  grantBoardAccess.mockResolvedValue({ granted: true, allowedUsers: [] })
  writeAuditLogBestEffort.mockResolvedValue(undefined)
})

describe('applyPendingUserSetupForNewUser', () => {
  it('aplica las claves nuevas y deja intacto lo que el pendiente no define', async () => {
    store.set('pendingUserSetup/nueva@bacarsa.com.ar', {
      role: 'admin',
      managedAreaIds: ['area-jefe'],
      memberAreaIds: ['area-miembro'],
      permissions: {
        view_drive: false,
        rag_assistant: true,
        rrhh_detalle: true,
        view_finanzas: true,
        finanzas_agenda: true,
        finanzas_cheques: false,
        finanzas_categorias: false,
        finanzas_transferencias: false,
        finanzas_destinatarios: false,
        manage_finanzas_caja: true,
        finanzas_saldos: 'si',
        manage_users: true,
        view_links: false,
      },
      boardAccess: [],
    })
    store.set('users/uid-1', {
      role: 'user',
      permissions: {
        view_directory: true,
        view_drive: true,
        view_links: true,
        rag_assistant: false,
        finanzas_saldos: true,
        algo_propio: true,
      },
    })

    const result = await applyPendingUserSetupForNewUser({
      uid: 'uid-1',
      email: 'Nueva@BacarSA.com.ar',
      displayName: 'Nueva',
    })

    expect(result).toEqual({ applied: true })
    expect(userPatch()).toMatchObject({
      role: 'admin',
      managedAreaIds: ['area-jefe'],
      memberAreaIds: ['area-miembro'],
      permissions: {
        view_directory: true,
        view_drive: false,
        view_links: true,
        rag_assistant: true,
        finanzas_saldos: true,
        algo_propio: true,
        rrhh_detalle: true,
        view_finanzas: true,
        finanzas_agenda: true,
        finanzas_cheques: false,
        finanzas_categorias: false,
        finanzas_transferencias: false,
        finanzas_destinatarios: false,
        manage_finanzas_caja: true,
      },
    })
    expect(userPatch()?.permissions).not.toHaveProperty('manage_users')
    expect(updates.some((row) => row.path === 'pendingUserSetup/nueva@bacarsa.com.ar' && row.patch.applied === true)).toBe(true)
  })

  it('un pendiente viejo solo pisa view_directory y view_drive', async () => {
    store.set('pendingUserSetup/viejo@bacarsa.com.ar', {
      role: 'admin',
      managedAreaIds: ['area-jefe'],
      memberAreaIds: ['area-miembro'],
      permissions: {
        view_directory: false,
        view_drive: true,
      },
      boardAccess: [{ boardFolderId: 'tablero-1', boardName: 'Compras' }],
    })
    store.set('users/uid-2', {
      role: 'user',
      permissions: {
        view_directory: true,
        view_drive: false,
        rag_assistant: true,
        view_finanzas: true,
        finanzas_agenda: true,
      },
    })

    const result = await applyPendingUserSetupForNewUser({
      uid: 'uid-2',
      email: 'viejo@bacarsa.com.ar',
      displayName: 'Viejo',
    })

    expect(result).toEqual({ applied: true })
    expect(userPatch()).toMatchObject({
      role: 'admin',
      managedAreaIds: ['area-jefe'],
      memberAreaIds: ['area-miembro'],
      permissions: {
        view_directory: false,
        view_drive: true,
        rag_assistant: true,
        view_finanzas: true,
        finanzas_agenda: true,
      },
    })
    expect(grantBoardAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        boardFolderId: 'tablero-1',
        boardName: 'Compras',
        grantee: expect.objectContaining({ uid: 'uid-2', email: 'viejo@bacarsa.com.ar' }),
      }),
    )
  })

  it('no vuelve a aplicar un pendiente ya aplicado', async () => {
    store.set('pendingUserSetup/ya@bacarsa.com.ar', {
      applied: true,
      role: 'admin',
      permissions: { view_directory: false, rag_assistant: true },
    })
    store.set('users/uid-3', {
      role: 'user',
      permissions: { view_directory: true, rag_assistant: false },
    })

    const result = await applyPendingUserSetupForNewUser({
      uid: 'uid-3',
      email: 'ya@bacarsa.com.ar',
      displayName: 'Ya',
    })

    expect(result).toEqual({ applied: false, reason: 'already_applied' })
    expect(updates).toEqual([])
    expect(grantBoardAccess).not.toHaveBeenCalled()
  })
})
