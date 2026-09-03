import type { Request, Response } from 'express'
import { Router } from 'express'
import { requireSuperAdmin, requireWorkspaceUser } from '../auth/middleware.js'
import { applyPendingUserSetupForNewUser } from './applyPendingUserSetup.js'
import { patchUserActionGrants } from './patchUserActionGrants.js'
import { patchUserManagedAreas, patchUserMemberAreas } from './patchUserAreas.js'

export const usersRouter = Router()

/** Respaldo del trigger Firestore: aplica pendingUserSetup al perfil autenticado (idempotente). */
usersRouter.post(
  '/apply-pending-setup',
  requireWorkspaceUser,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const result = await applyPendingUserSetupForNewUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    })

    res.json(result)
  },
)

/** Excepciones de gobernanza por acción y área (solo super_admin, Admin SDK). */
usersRouter.patch(
  '/:uid/action-grants',
  requireWorkspaceUser,
  requireSuperAdmin,
  patchUserActionGrants,
)

/** Áreas que gobierna un admin de área (solo super_admin, Admin SDK). */
usersRouter.patch(
  '/:uid/managed-areas',
  requireWorkspaceUser,
  requireSuperAdmin,
  patchUserManagedAreas,
)

/** Áreas de pertenencia (solo super_admin, Admin SDK). */
usersRouter.patch(
  '/:uid/member-areas',
  requireWorkspaceUser,
  requireSuperAdmin,
  patchUserMemberAreas,
)
