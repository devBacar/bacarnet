import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import {
  ASSISTANT_PENDING_ACTIONS_COLLECTION,
  PENDING_ACTION_TTL_MS,
  type AssistantActionStatus,
  type AssistantPendingActionDto,
  type AssistantPendingActionRecord,
  type CalendarActionPayload,
  type CalendarActionPreview,
  type CalendarCancelActionPayload,
  type CalendarCancelActionPreview,
  type EmailActionPayload,
  type EmailActionPreview,
} from './types.js'
import { listExternalAttendees } from './validateCorporateEmails.js'

function toDto(id: string, data: AssistantPendingActionRecord): AssistantPendingActionDto {
  return {
    id,
    type: data.type,
    status: data.status,
    preview: data.preview,
    expiresAt: data.expiresAt.toDate().toISOString(),
  }
}

export async function createPendingEmailAction(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  payload: EmailActionPayload
}): Promise<AssistantPendingActionDto> {
  const preview: EmailActionPreview = {
    from: input.impersonateAs,
    ...input.payload,
  }
  return createPendingAction({
    ...input,
    type: 'email',
    payload: input.payload,
    preview,
  })
}

export async function createPendingCalendarCancelAction(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  payload: CalendarCancelActionPayload
}): Promise<AssistantPendingActionDto> {
  const preview: CalendarCancelActionPreview = {
    organizer: input.impersonateAs,
    ...input.payload,
  }
  return createPendingAction({
    ...input,
    type: 'calendar_cancel',
    payload: input.payload,
    preview,
  })
}

export async function createPendingCalendarAction(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  payload: CalendarActionPayload
  calendarConflicts?: CalendarActionPreview['calendarConflicts']
}): Promise<AssistantPendingActionDto> {
  const externalAttendees = listExternalAttendees(input.payload.attendees)
  const preview: CalendarActionPreview = {
    organizer: input.impersonateAs,
    ...input.payload,
    calendarConflicts: input.calendarConflicts ?? [],
    ...(externalAttendees.length > 0 ? { externalAttendees } : {}),
  }
  return createPendingAction({
    ...input,
    type: 'calendar_event',
    payload: input.payload,
    preview,
  })
}

async function createPendingAction(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  type: AssistantPendingActionRecord['type']
  payload: EmailActionPayload | CalendarActionPayload | CalendarCancelActionPayload
  preview: EmailActionPreview | CalendarActionPreview | CalendarCancelActionPreview
}): Promise<AssistantPendingActionDto> {
  const expiresAt = Timestamp.fromMillis(Date.now() + PENDING_ACTION_TTL_MS)
  const docRef = adminDb().collection(ASSISTANT_PENDING_ACTIONS_COLLECTION).doc()

  const record: AssistantPendingActionRecord = {
    type: input.type,
    status: 'pending',
    userId: input.userId,
    userEmail: input.userEmail.trim().toLowerCase(),
    impersonateAs: input.impersonateAs.trim().toLowerCase(),
    payload: input.payload,
    preview: input.preview,
    expiresAt,
    createdAt: Timestamp.now(),
  }

  await docRef.set(record)
  return toDto(docRef.id, record)
}

export async function getPendingActionForUser(
  actionId: string,
  userId: string,
): Promise<{ id: string; data: AssistantPendingActionRecord } | null> {
  const snap = await adminDb()
    .collection(ASSISTANT_PENDING_ACTIONS_COLLECTION)
    .doc(actionId)
    .get()

  if (!snap.exists) return null
  const data = snap.data() as AssistantPendingActionRecord
  if (data.userId !== userId) return null
  return { id: snap.id, data }
}

export function isPendingActionExpired(data: AssistantPendingActionRecord): boolean {
  return data.expiresAt.toMillis() <= Date.now()
}

export async function markPendingActionStatus(
  actionId: string,
  status: AssistantActionStatus,
  result?: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'confirmed') {
    patch.confirmedAt = FieldValue.serverTimestamp()
  }
  if (status === 'cancelled') {
    patch.cancelledAt = FieldValue.serverTimestamp()
  }
  if (result) {
    patch.result = result
  }
  await adminDb().collection(ASSISTANT_PENDING_ACTIONS_COLLECTION).doc(actionId).update(patch)
}

export function pendingActionToToolResponse(dto: AssistantPendingActionDto): Record<string, unknown> {
  return {
    requiresConfirmation: true,
    pendingActionId: dto.id,
    actionType: dto.type,
    preview: dto.preview,
    expiresAt: dto.expiresAt,
    message:
      'Borrador preparado. El usuario debe revisarlo y confirmar explícitamente en la interfaz del chat antes de ejecutar la acción.',
  }
}
