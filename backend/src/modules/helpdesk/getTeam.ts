import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listActiveHelpdeskTeamMembers } from './repository.js'

export async function getTeamHandler(_req: Request, res: Response): Promise<void> {
  try {
    const members = await listActiveHelpdeskTeamMembers()
    res.json({
      members: members.map((m) => ({
        id: m.id,
        uid: m.uid ?? null,
        nombre: m.nombre,
        email: m.email,
        rol: m.rol,
        primeraReunion: m.primeraReunion,
      })),
    })
  } catch (err) {
    logError('getTeam falló', err)
    res.status(500).json({ error: 'No se pudo listar el equipo' })
  }
}
