import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { resolveInteractionUsage } from './assistantUsageMeter.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

const MAX_INTERACTIONS = 4000

function serializeTimestamp(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

export type AssistantUsageWindowSummary = {
  from: string
  to: string
  questions: number
  estimatedCostUsd: number
  averageCostUsdPerQuestion: number
}

export function previousCompletedWeekBounds(now: Date): { from: Date; to: Date } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekday = (day.getDay() + 6) % 7
  const thisMonday = new Date(day)
  thisMonday.setDate(day.getDate() - weekday)
  const prevMonday = new Date(thisMonday)
  prevMonday.setDate(thisMonday.getDate() - 7)
  const prevSundayEnd = new Date(thisMonday)
  prevSundayEnd.setMilliseconds(prevSundayEnd.getMilliseconds() - 1)
  return { from: prevMonday, to: prevSundayEnd }
}

export function aggregateUsageFromSnapshots(
  docs: QueryDocumentSnapshot[],
  from: Date,
  to: Date,
): Omit<AssistantUsageWindowSummary, 'from' | 'to'> {
  let questions = 0
  let estimatedCostUsd = 0

  for (const doc of docs) {
    const data = doc.data()
    const createdAt = serializeTimestamp(data.createdAt)
    if (!createdAt || createdAt < from || createdAt > to) continue
    questions += 1
    estimatedCostUsd += resolveInteractionUsage(data).estimatedCostUsd
  }

  return {
    questions,
    estimatedCostUsd,
    averageCostUsdPerQuestion: questions > 0 ? estimatedCostUsd / questions : 0,
  }
}

export async function loadRecentAssistantInteractionDocs(): Promise<QueryDocumentSnapshot[]> {
  const snap = await adminDb()
    .collection(ASSISTANT_INTERACTIONS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(MAX_INTERACTIONS)
    .get()
  return snap.docs
}

export async function computeAssistantUsageForWindow(
  from: Date,
  to: Date,
): Promise<AssistantUsageWindowSummary> {
  const docs = await loadRecentAssistantInteractionDocs()
  const totals = aggregateUsageFromSnapshots(docs, from, to)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...totals,
  }
}

export async function computePreviousWeekAssistantUsage(
  now: Date = new Date(),
): Promise<AssistantUsageWindowSummary> {
  const { from, to } = previousCompletedWeekBounds(now)
  return computeAssistantUsageForWindow(from, to)
}
