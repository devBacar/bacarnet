import { getFreeBusyForEmails } from './calendar.js'
import {
  buildInitialAvailabilitySlots,
  isJointSlotFree,
  slotRangeToQueryWindow,
} from './slotScheduling.js'

export async function buildAvailabilitySlotsForEmails(
  emails: string[],
  semanaOffset: number,
): Promise<Array<{ fecha: string; hora: string; libre: boolean }>> {
  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (normalized.length === 0) {
    return []
  }

  const slotLabels = buildInitialAvailabilitySlots(
    Number.isFinite(semanaOffset) ? semanaOffset : 0,
  )
  const { timeMinISO, timeMaxISO } = slotRangeToQueryWindow(slotLabels)
  const busyByEmail = await getFreeBusyForEmails(normalized, timeMinISO, timeMaxISO)

  return slotLabels.map((slot) => ({
    fecha: slot.fecha,
    hora: slot.hora,
    libre: isJointSlotFree(busyByEmail, normalized, slot.fecha, slot.hora),
  }))
}
