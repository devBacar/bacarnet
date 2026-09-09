import { adminDb } from '../../lib/firebase/admin.js'
import { getAreaDisplayName } from '../drive/resolveAreaMembers.js'

const TECHNICAL_KEY_PATTERN =
  /^(id|uid|userId|targetId|fileId|folderId|parentFolderId|governingAreaId|permissionId|chunkIndex|embeddingIndex)$/i

const ACTION_LABELS: Record<string, string> = {
  create: 'Creación',
  delete: 'Eliminación',
  edit: 'Edición',
  rename: 'Renombrado',
  permission_grant: 'Otorgó permiso',
  permission_revoke: 'Revocó permiso',
  role_change: 'Cambio de rol',
  managed_areas_change: 'Cambio de áreas administradas',
  member_areas_change: 'Cambio de áreas miembro',
  action_grants_change: 'Cambio de permisos de acción',
  password_reset: 'Restablecimiento de contraseña',
  classification_change: 'Cambio de clasificación',
  authorized_copy: 'Copia autorizada',
  approval: 'Aprobación',
  audit_correction: 'Corrección de auditoría',
  board_view: 'Vista de tablero',
  board_access_grant: 'Acceso a tablero otorgado',
  board_access_revoke: 'Acceso a tablero revocado',
  pending_setup_applied: 'Configuración pendiente aplicada',
  external_account_approved: 'Cuenta externa aprobada',
  external_account_rejected: 'Cuenta externa rechazada',
  assistant_email_sent: 'Correo enviado por asistente',
  assistant_calendar_event_created: 'Evento creado por asistente',
  assistant_calendar_event_cancelled: 'Evento cancelado por asistente',
}

const METADATA_KEY_LABELS: Record<string, string> = {
  granteeEmail: 'Destinatario',
  role: 'Rol',
  driveRole: 'Rol en Drive',
  type: 'Tipo',
  domain: 'Dominio',
  previousName: 'Nombre anterior',
  newName: 'Nombre nuevo',
  classification: 'Clasificación',
  areaName: 'Área',
  governingAreaName: 'Área',
}

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

export async function resolveUserReadableLabel(input: {
  userId?: string | null
  userEmail?: string | null
}): Promise<string> {
  if (input.userEmail?.trim()) {
    const email = input.userEmail.trim().toLowerCase()
    if (input.userId?.trim()) {
      const snap = await adminDb().collection('users').doc(input.userId.trim()).get()
      if (snap.exists) {
        const displayName = snap.get('displayName')
        if (typeof displayName === 'string' && displayName.trim()) {
          return `${displayName.trim()} (${email})`
        }
      }
    }
    return email
  }

  if (input.userId?.trim()) {
    const snap = await adminDb().collection('users').doc(input.userId.trim()).get()
    if (!snap.exists) return 'Usuario desconocido'
    const email = typeof snap.get('email') === 'string' ? snap.get('email').trim().toLowerCase() : ''
    const displayName = typeof snap.get('displayName') === 'string' ? snap.get('displayName').trim() : ''
    if (displayName && email) return `${displayName} (${email})`
    return email || displayName || 'Usuario desconocido'
  }

  return 'Usuario desconocido'
}

async function resolveAreaValue(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !value.trim()) return null
  const name = await getAreaDisplayName(value.trim())
  return name ?? null
}

async function sanitizeMetadata(metadata: Record<string, unknown>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (TECHNICAL_KEY_PATTERN.test(key)) continue
    if (value === null || value === undefined) continue

    if (key === 'governingAreaId' || key === 'areaId') {
      const areaName = await resolveAreaValue(value)
      if (areaName) out['Área'] = areaName
      continue
    }

    const label = METADATA_KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim()
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[label] = String(value)
    }
  }

  return out
}

export async function sanitizeAuditLogRow(data: {
  userId?: string
  userEmail?: string
  action?: string
  targetType?: string
  targetId?: string
  targetName?: string
  reason?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string | null
}): Promise<Record<string, unknown>> {
  const actor = await resolveUserReadableLabel({
    userId: data.userId,
    userEmail: data.userEmail,
  })

  return {
    occurredAt: data.createdAt ?? null,
    actor,
    actorEmail: data.userEmail?.trim().toLowerCase() ?? null,
    action: formatAuditAction(data.action ?? ''),
    targetType: data.targetType ?? null,
    targetName: data.targetName ?? null,
    reason: data.reason ?? null,
    details: await sanitizeMetadata(data.metadata ?? {}),
  }
}

export function stripTechnicalFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripTechnicalFields(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (TECHNICAL_KEY_PATTERN.test(key)) continue
    out[key] = stripTechnicalFields(nested)
  }
  return out
}

export function buildWelcomeMessage(areaLabels: string[]): string {
  const actionsHint =
    ' También podés pedirme que prepare un correo o un evento de calendario (siempre con confirmación previa).'
  if (areaLabels.length === 0) {
    return `Podés preguntar por el contenido de tus documentos, o por inventario de las áreas a las que tenés acceso.${actionsHint}`
  }
  if (areaLabels.length === 1) {
    return `Podés preguntar por el contenido de tus documentos, o por inventario del área ${areaLabels[0]}.${actionsHint}`
  }
  return `Podés preguntar por el contenido de tus documentos, o por inventario de las áreas: ${areaLabels.join(', ')}.${actionsHint}`
}

export async function resolveAccessibleAreaLabels(input: {
  pilotGoverningAreaId: string
  pilotLabel: string
  excludedGoverningAreaIds: string[]
}): Promise<string[]> {
  if (input.excludedGoverningAreaIds.includes(input.pilotGoverningAreaId)) {
    return []
  }
  const resolved = await getAreaDisplayName(input.pilotGoverningAreaId)
  return [resolved ?? input.pilotLabel]
}
