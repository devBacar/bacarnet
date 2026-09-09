import { Router } from 'express'
import { listAssignableRootAreasHandler } from './listAssignableRootAreasHandler.js'

export const catalogRouter = Router()

catalogRouter.get('/assignable-areas', listAssignableRootAreasHandler)
