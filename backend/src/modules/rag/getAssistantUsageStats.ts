import type { Request, Response } from 'express'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import {
  ASSISTANT_USAGE_PRICING,
  categorizeToolUsage,
  resolveInteractionUsage,
  TOOL_CATEGORY_LABELS,
  type AssistantToolCategory,
} from './assistantUsageMeter.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

const MAX_INTERACTIONS = 4000
const HISTORY_MONTHS = 6

function serializeTimestamp(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function weekKey(date: Date): string {
  const day = startOfDay(date)
  const weekday = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - weekday)
  return day.toISOString().slice(0, 10)
}

export async function getAssistantUsageStats(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user || !isSuperAdminUser(user)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }

  try {
    const snap = await adminDb()
      .collection(ASSISTANT_INTERACTIONS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(MAX_INTERACTIONS)
      .get()

    const now = new Date()
    const currentMonthKey = monthKey(now)
    const dayMs = 24 * 60 * 60 * 1000

    let totalQuestions = 0
    let measuredCount = 0
    let estimatedCount = 0
    let currentMonthCostUsd = 0
    let currentMonthQuestions = 0

    const byUser = new Map<
      string,
      { userEmail: string; questions: number; estimatedCostUsd: number }
    >()
    const byDay = new Map<string, number>()
    const byWeek = new Map<string, number>()
    const byMonth = new Map<string, { questions: number; estimatedCostUsd: number }>()
    const byToolCategory = new Map<AssistantToolCategory, number>()
    const byToolName = new Map<string, number>()

    for (const doc of snap.docs) {
      const data = doc.data()
      const createdAt = serializeTimestamp(data.createdAt)
      if (!createdAt) continue

      totalQuestions += 1
      const usage = resolveInteractionUsage({
        question: typeof data.question === 'string' ? data.question : '',
        answer: typeof data.answer === 'string' ? data.answer : '',
        toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
        usage: data.usage,
      })

      if (usage.source === 'measured') measuredCount += 1
      else estimatedCount += 1

      const userEmail =
        typeof data.userEmail === 'string' && data.userEmail.trim()
          ? data.userEmail.trim().toLowerCase()
          : 'desconocido'
      const userStats = byUser.get(userEmail) ?? {
        userEmail,
        questions: 0,
        estimatedCostUsd: 0,
      }
      userStats.questions += 1
      userStats.estimatedCostUsd += usage.estimatedCostUsd
      byUser.set(userEmail, userStats)

      const day = startOfDay(createdAt).toISOString().slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
      byWeek.set(weekKey(createdAt), (byWeek.get(weekKey(createdAt)) ?? 0) + 1)

      const month = monthKey(createdAt)
      const monthStats = byMonth.get(month) ?? { questions: 0, estimatedCostUsd: 0 }
      monthStats.questions += 1
      monthStats.estimatedCostUsd += usage.estimatedCostUsd
      byMonth.set(month, monthStats)

      if (month === currentMonthKey) {
        currentMonthCostUsd += usage.estimatedCostUsd
        currentMonthQuestions += 1
      }

      const tools = Array.isArray(data.toolsUsed)
        ? data.toolsUsed.filter((item): item is string => typeof item === 'string')
        : []
      for (const tool of tools) {
        byToolName.set(tool, (byToolName.get(tool) ?? 0) + 1)
        const category = categorizeToolUsage(tool)
        byToolCategory.set(category, (byToolCategory.get(category) ?? 0) + 1)
      }
    }

    const last14Days: Array<{ date: string; questions: number }> = []
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(now.getTime() - offset * dayMs)
      const key = startOfDay(date).toISOString().slice(0, 10)
      last14Days.push({ date: key, questions: byDay.get(key) ?? 0 })
    }

    const monthlyHistory = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-HISTORY_MONTHS)
      .map(([month, stats]) => ({
        month,
        questions: stats.questions,
        estimatedCostUsd: stats.estimatedCostUsd,
      }))

    res.json({
      disclaimer:
        'Estimación interna basada en interacciones registradas. No es la factura real de Google Cloud Billing.',
      pricing: ASSISTANT_USAGE_PRICING,
      totals: {
        questions: totalQuestions,
        measuredInteractions: measuredCount,
        estimatedInteractions: estimatedCount,
        currentMonthQuestions,
        currentMonthEstimatedCostUsd: currentMonthCostUsd,
      },
      volume: {
        byUser: [...byUser.values()].sort((a, b) => b.questions - a.questions),
        last14Days,
        byWeek: [...byWeek.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-8)
          .map(([weekStart, questions]) => ({ weekStart, questions })),
      },
      tools: {
        byCategory: [...byToolCategory.entries()]
          .map(([category, count]) => ({
            category,
            label: TOOL_CATEGORY_LABELS[category],
            count,
          }))
          .sort((a, b) => b.count - a.count),
        byName: [...byToolName.entries()]
          .map(([toolName, count]) => ({ toolName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
      },
      monthlyHistory,
      scannedInteractions: snap.size,
      generatedAt: now.toISOString(),
    })
  } catch (err) {
    logError('getAssistantUsageStats falló', err)
    res.status(500).json({ error: 'No se pudieron calcular las estadísticas de consumo' })
  }
}
