import { doc, getDoc, onSnapshot, setDoc, type DocumentData, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

const GLOBAL_SETTINGS_COLLECTION = 'global_settings'
const GLOBAL_SETTINGS_DOC_ID = 'main'

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
  | 'kudosEnabled'
  | 'pollsEnabled'
  | 'boardsEnabled'
  | 'notificationsEnabled'
  | 'newsEnabled'

export interface GlobalSettings {
  resourcesEnabled: boolean
  directoryEnabled: boolean
  kudosEnabled: boolean
  pollsEnabled: boolean
  boardsEnabled: boolean
  notificationsEnabled: boolean
  newsEnabled: boolean
  departments: string[]
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  resourcesEnabled: true,
  directoryEnabled: true,
  kudosEnabled: true,
  pollsEnabled: true,
  boardsEnabled: true,
  notificationsEnabled: true,
  newsEnabled: true,
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
    kudosEnabled: data.kudosEnabled ?? DEFAULT_GLOBAL_SETTINGS.kudosEnabled,
    pollsEnabled: data.pollsEnabled ?? DEFAULT_GLOBAL_SETTINGS.pollsEnabled,
    boardsEnabled: data.boardsEnabled ?? DEFAULT_GLOBAL_SETTINGS.boardsEnabled,
    notificationsEnabled:
      data.notificationsEnabled ?? DEFAULT_GLOBAL_SETTINGS.notificationsEnabled,
    newsEnabled: data.newsEnabled ?? DEFAULT_GLOBAL_SETTINGS.newsEnabled,
    departments: normalizeDepartments(data.departments),
  }
}

function settingsDocRef() {
  return doc(db, GLOBAL_SETTINGS_COLLECTION, GLOBAL_SETTINGS_DOC_ID)
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const snapshot = await getDoc(settingsDocRef())

  if (!snapshot.exists()) {
    return { ...DEFAULT_GLOBAL_SETTINGS }
  }

  return mapDocToGlobalSettings(snapshot.data())
}

export async function updateGlobalSettings(settings: GlobalSettings): Promise<void> {
  await setDoc(
    settingsDocRef(),
    {
      resourcesEnabled: settings.resourcesEnabled,
      directoryEnabled: settings.directoryEnabled,
      kudosEnabled: settings.kudosEnabled,
      pollsEnabled: settings.pollsEnabled,
      boardsEnabled: settings.boardsEnabled,
      notificationsEnabled: settings.notificationsEnabled,
      newsEnabled: settings.newsEnabled,
      departments: normalizeDepartments(settings.departments),
    },
    { merge: true },
  )
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
