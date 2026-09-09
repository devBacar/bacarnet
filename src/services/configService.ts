import { doc, getDoc, onSnapshot, setDoc, type DocumentData, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

const GLOBAL_SETTINGS_COLLECTION = 'global_settings'
const GLOBAL_SETTINGS_DOC_ID = 'main'
const RAG_SETTINGS_DOC_ID = 'rag'

export const DEFAULT_DEPARTMENTS = [
  'General',
  'Operaciones',
  'Sistemas',
  'Administración',
  'RRHH',
] as const

export type GlobalModuleFlag =
  | 'resourcesEnabled'
  | 'directoryEnabled'
  | 'pollsEnabled'
  | 'boardsEnabled'
  | 'notificationsEnabled'

export interface GlobalSettings {
  resourcesEnabled: boolean
  directoryEnabled: boolean
  pollsEnabled: boolean
  boardsEnabled: boolean
  notificationsEnabled: boolean
  departments: string[]
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  resourcesEnabled: true,
  directoryEnabled: true,
  pollsEnabled: true,
  boardsEnabled: true,
  notificationsEnabled: true,
  departments: [...DEFAULT_DEPARTMENTS],
}

function normalizeDepartments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_DEPARTMENTS]
  }

  const unique = new Map<string, string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase('es-AR')
    if (!unique.has(key)) {
      unique.set(key, trimmed)
    }
  }

  const departments = Array.from(unique.values()).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  )

  return departments.length > 0 ? departments : [...DEFAULT_DEPARTMENTS]
}

function mapDocToGlobalSettings(data: DocumentData): GlobalSettings {
  return {
    resourcesEnabled: data.resourcesEnabled ?? DEFAULT_GLOBAL_SETTINGS.resourcesEnabled,
    directoryEnabled: data.directoryEnabled ?? DEFAULT_GLOBAL_SETTINGS.directoryEnabled,
    pollsEnabled: data.pollsEnabled ?? DEFAULT_GLOBAL_SETTINGS.pollsEnabled,
    boardsEnabled: data.boardsEnabled ?? DEFAULT_GLOBAL_SETTINGS.boardsEnabled,
    notificationsEnabled:
      data.notificationsEnabled ?? DEFAULT_GLOBAL_SETTINGS.notificationsEnabled,
    departments: normalizeDepartments(data.departments),
  }
}

function settingsDocRef() {
  return doc(db, GLOBAL_SETTINGS_COLLECTION, GLOBAL_SETTINGS_DOC_ID)
}

function ragSettingsDocRef() {
  return doc(db, GLOBAL_SETTINGS_COLLECTION, RAG_SETTINGS_DOC_ID)
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const snapshot = await getDoc(settingsDocRef())

  if (!snapshot.exists()) {
    return { ...DEFAULT_GLOBAL_SETTINGS }
  }

  return mapDocToGlobalSettings(snapshot.data())
}

export async function getRagAssistantGlobalEnabled(): Promise<boolean> {
  const snapshot = await getDoc(ragSettingsDocRef())
  if (!snapshot.exists()) return false
  return snapshot.data().enabled === true
}

export async function updateGlobalSettings(settings: GlobalSettings): Promise<void> {
  await setDoc(
    settingsDocRef(),
    {
      resourcesEnabled: settings.resourcesEnabled,
      directoryEnabled: settings.directoryEnabled,
      pollsEnabled: settings.pollsEnabled,
      boardsEnabled: settings.boardsEnabled,
      notificationsEnabled: settings.notificationsEnabled,
      departments: normalizeDepartments(settings.departments),
    },
    { merge: true },
  )
}

export async function updateRagAssistantGlobalEnabled(enabled: boolean): Promise<void> {
  await setDoc(ragSettingsDocRef(), { enabled }, { merge: true })
}

export async function updateDepartments(departments: string[]): Promise<void> {
  await setDoc(
    settingsDocRef(),
    { departments: normalizeDepartments(departments) },
    { merge: true },
  )
}

export function subscribeGlobalSettings(
  onData: (settings: GlobalSettings) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsDocRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({ ...DEFAULT_GLOBAL_SETTINGS })
        return
      }
      onData(mapDocToGlobalSettings(snapshot.data()))
    },
    (error) => {
      const code = (error as { code?: string }).code
      if (code !== 'permission-denied') {
        console.error('Error al suscribirse a global_settings:', error)
      }
      onError?.(error)
      onData({ ...DEFAULT_GLOBAL_SETTINGS })
    },
  )
}
