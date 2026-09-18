import { collection, doc, documentId, getDoc, getDocs, query, setDoc, where, type DocumentData } from 'firebase/firestore'
import { addWeeks, getWeekKey, getWeekRangeLabel, getYearWeekKeys, weeksBetween } from '../utils/weekUtils'
import { db } from './firebase'

const JEFE_COLLECTION = 'shiftJefeAssignments'
const SYSTEMS_SETTINGS_COLLECTION = 'shift_settings'
const SYSTEMS_SETTINGS_ID = 'systems'
const SYSTEMS_OVERRIDES_COLLECTION = 'shiftSystemsOverrides'

export const DEFAULT_SYSTEMS_MEMBERS = ['Manuel', 'Cristian', 'Marcos', 'Franco'] as const

export interface ShiftJefeAssignment {
  weekKey: string
  firstName: string
  lastName: string
  internalPhone: string
}

export interface SystemsRotationConfig {
  members: string[]
  anchorWeekKey: string
  anchorIndex: number
}

export interface SystemsShiftOverride {
  weekKey: string
  assigneeName: string
  reason?: string
}

export interface WeekShiftSnapshot {
  weekKey: string
  weekLabel: string
  systems: {
    name: string
    isOverride: boolean
  } | null
}

const DEFAULT_SYSTEMS_ROTATION: SystemsRotationConfig = {
  members: [...DEFAULT_SYSTEMS_MEMBERS],
  anchorWeekKey: getWeekKey(),
  anchorIndex: 0,
}

function mapJefeDoc(weekKey: string, data: DocumentData): ShiftJefeAssignment {
  return {
    weekKey,
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    internalPhone: data.internalPhone ?? '',
  }
}

export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

export function resolveSystemsAssignee(
  config: SystemsRotationConfig,
  weekKey: string,
  override: SystemsShiftOverride | null,
): { name: string; isOverride: boolean } {
  if (override?.assigneeName) {
    return { name: override.assigneeName, isOverride: true }
  }

  const { members, anchorWeekKey, anchorIndex } = config
  if (members.length === 0) {
    return { name: '', isOverride: false }
  }

  const diff = weeksBetween(anchorWeekKey, weekKey)
  const index = ((anchorIndex + diff) % members.length + members.length) % members.length
  return { name: members[index], isOverride: false }
}

function normalizeMembersField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      .map((m) => m.trim())
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  }
  return [...DEFAULT_SYSTEMS_MEMBERS]
}

export async function getSystemsRotationConfig(): Promise<SystemsRotationConfig> {
  const snapshot = await getDoc(doc(db, SYSTEMS_SETTINGS_COLLECTION, SYSTEMS_SETTINGS_ID))

  if (!snapshot.exists()) {
    return { ...DEFAULT_SYSTEMS_ROTATION, members: [...DEFAULT_SYSTEMS_MEMBERS] }
  }

  const data = snapshot.data()
  const members = normalizeMembersField(data.members)

  return {
    members: members.length > 0 ? members : [...DEFAULT_SYSTEMS_MEMBERS],
    anchorWeekKey: typeof data.anchorWeekKey === 'string' ? data.anchorWeekKey : getWeekKey(),
    anchorIndex: typeof data.anchorIndex === 'number' ? data.anchorIndex : 0,
  }
}

export async function saveSystemsRotationConfig(
  config: SystemsRotationConfig,
): Promise<void> {
  await setDoc(doc(db, SYSTEMS_SETTINGS_COLLECTION, SYSTEMS_SETTINGS_ID), {
    members: config.members,
    anchorWeekKey: config.anchorWeekKey,
    anchorIndex: config.anchorIndex,
  })
}

export async function getJefeAssignment(weekKey: string): Promise<ShiftJefeAssignment | null> {
  const snapshot = await getDoc(doc(db, JEFE_COLLECTION, weekKey))

  if (!snapshot.exists()) {
    return null
  }

  return mapJefeDoc(weekKey, snapshot.data())
}

/** Carga en lote las asignaciones de jefe para un año calendario. */
export async function getJefeAssignmentsForYear(
  year: number,
): Promise<Map<string, ShiftJefeAssignment>> {
  const weekKeys = getYearWeekKeys(year)
  const map = new Map<string, ShiftJefeAssignment>()

  if (weekKeys.length === 0) {
    return map
  }

  const startKey = weekKeys[0]
  const endKey = weekKeys[weekKeys.length - 1]

  const snapshot = await getDocs(
    query(
      collection(db, JEFE_COLLECTION),
      where(documentId(), '>=', startKey),
      where(documentId(), '<=', endKey),
    ),
  )

  snapshot.forEach((docSnap) => {
    const assignment = mapJefeDoc(docSnap.id, docSnap.data())
    if (assignment.firstName.trim() || assignment.lastName.trim()) {
      map.set(docSnap.id, assignment)
    }
  })

  return map
}

export async function saveJefeAssignment(
  assignment: Omit<ShiftJefeAssignment, 'weekKey'> & { weekKey: string },
): Promise<void> {
  await setDoc(doc(db, JEFE_COLLECTION, assignment.weekKey), {
    firstName: assignment.firstName.trim(),
    lastName: assignment.lastName.trim(),
    internalPhone: assignment.internalPhone.trim(),
  })
}

export async function getSystemsOverride(
  weekKey: string,
): Promise<SystemsShiftOverride | null> {
  const snapshot = await getDoc(doc(db, SYSTEMS_OVERRIDES_COLLECTION, weekKey))

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data()
  const assigneeName = data.assigneeName ?? ''
  if (!assigneeName.trim()) {
    return null
  }

  return {
    weekKey,
    assigneeName,
    reason: typeof data.reason === 'string' ? data.reason : undefined,
  }
}

export async function saveSystemsOverride(
  override: SystemsShiftOverride,
): Promise<void> {
  await setDoc(doc(db, SYSTEMS_OVERRIDES_COLLECTION, override.weekKey), {
    assigneeName: override.assigneeName.trim(),
    ...(override.reason?.trim() ? { reason: override.reason.trim() } : {}),
  })
}

export async function clearSystemsOverride(weekKey: string): Promise<void> {
  await setDoc(doc(db, SYSTEMS_OVERRIDES_COLLECTION, weekKey), {
    assigneeName: '',
  })
}

export async function getWeekShiftSnapshot(
  weekKey: string = getWeekKey(),
): Promise<WeekShiftSnapshot> {
  const [config, override] = await Promise.all([
    getSystemsRotationConfig(),
    getSystemsOverride(weekKey),
  ])

  const systems = resolveSystemsAssignee(config, weekKey, override)

  return {
    weekKey,
    weekLabel: getWeekRangeLabel(weekKey),
    systems: systems.name
      ? { name: systems.name, isOverride: systems.isOverride }
      : null,
  }
}

export async function previewSystemsRotation(
  fromWeekKey: string,
  count: number,
): Promise<Array<{ weekKey: string; name: string; isOverride: boolean }>> {
  const config = await getSystemsRotationConfig()
  const results: Array<{ weekKey: string; name: string; isOverride: boolean }> = []

  for (let i = 0; i < count; i++) {
    const weekKey = addWeeks(fromWeekKey, i)
    const override = await getSystemsOverride(weekKey)
    const resolved = resolveSystemsAssignee(config, weekKey, override)
    results.push({ weekKey, name: resolved.name, isOverride: resolved.isOverride })
  }

  return results
}
