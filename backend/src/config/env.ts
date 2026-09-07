import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Cloud Functions 2nd gen en prod (Cloud Run). El emulador también define K_SERVICE pero debe usar keyFiles locales. */
export function isCloudFunctionsRuntime(): boolean {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return false
  return Boolean(process.env.K_SERVICE)
}

function loadLocalEnvFiles(): void {
  if (isCloudFunctionsRuntime()) return

  const backendDir = resolve(__dirname, '../..')
  const localPath = resolve(backendDir, '.env.local')
  const envPath = resolve(backendDir, '.env')

  if (existsSync(localPath)) {
    loadEnv({ path: localPath, override: false })
  }
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false })
  }
}

loadLocalEnvFiles()

const DEFAULT_DOMAIN = 'bacarsa.com.ar'
const DEFAULT_IMPERSONATE = 'datos@bacarsa.com.ar'

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'] as const

export function getEnv() {
  const allowedEmailDomain = (
    process.env.ALLOWED_EMAIL_DOMAIN ?? DEFAULT_DOMAIN
  )
    .trim()
    .toLowerCase()
    .replace(/^@/, '')

  const driveImpersonateEmail = (
    process.env.DRIVE_IMPERSONATE_EMAIL ?? DEFAULT_IMPERSONATE
  )
    .trim()
    .toLowerCase()

  const driveServiceAccountEmail = process.env.DRIVE_SERVICE_ACCOUNT_EMAIL?.trim() || null
  const useLocalKeyFiles = !isCloudFunctionsRuntime()
  const driveServiceAccountKeyPath = useLocalKeyFiles
    ? process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH?.trim() || null
    : null
  const adminSdkKeyPath = useLocalKeyFiles
    ? process.env.ADMIN_SDK_KEY_PATH?.trim() || null
    : null
  const driveId = process.env.DRIVE_ID?.trim() || ''
  const boardsContainerFolderId = process.env.BOARDS_CONTAINER_FOLDER_ID?.trim() || ''
  const boardsSessionSecret = process.env.BOARDS_SESSION_SECRET?.trim() || ''
  const pendingUploadsBucket =
    process.env.PENDING_UPLOADS_BUCKET?.trim() || 'bacar-pending-uploads'
  const ragStagingBucket = process.env.RAG_STAGING_BUCKET?.trim() || 'bacar-rag-staging'
  const ragStagingLocation =
    process.env.RAG_STAGING_LOCATION?.trim() || 'SOUTHAMERICA-EAST1'
  const ragEmbeddingLocation =
    process.env.RAG_EMBEDDING_LOCATION?.trim() || 'us-central1'
  const gcpProjectId =
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    ''

  if (!allowedEmailDomain) {
    throw new Error('ALLOWED_EMAIL_DOMAIN está vacío')
  }
  if (!driveImpersonateEmail.includes('@')) {
    throw new Error('DRIVE_IMPERSONATE_EMAIL inválido')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(driveId)) {
    throw new Error('DRIVE_ID no está definido o tiene un formato inválido')
  }

  return {
    allowedEmailDomain,
    driveImpersonateEmail,
    driveServiceAccountEmail,
    driveServiceAccountKeyPath,
    adminSdkKeyPath,
    driveId,
    boardsContainerFolderId,
    boardsSessionSecret,
    pendingUploadsBucket,
    ragStagingBucket,
    ragStagingLocation,
    ragEmbeddingLocation,
    gcpProjectId,
  }
}

export function isEmailInAllowedDomain(email: string, domain: string): boolean {
  const normalized = email.trim().toLowerCase()
  return normalized.endsWith(`@${domain}`)
}
