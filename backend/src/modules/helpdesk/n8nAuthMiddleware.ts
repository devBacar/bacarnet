import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { getEnv } from '../../config/env.js'

function safeEqualApiKey(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function requireHelpdeskN8nApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = getEnv().helpdeskN8nApiKey
  if (!expected) {
    res.status(503).json({ error: 'Endpoint de campaña no configurado' })
    return
  }

  const header = req.headers['x-api-key']
  const provided = typeof header === 'string' ? header.trim() : ''
  if (!provided || !safeEqualApiKey(provided, expected)) {
    res.status(401).json({ error: 'API key inválida' })
    return
  }

  next()
}
