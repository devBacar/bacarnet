import type { Timestamp } from 'firebase-admin/firestore'

export const ST_TICKET_LINKS_COLLECTION = 'stTicketLinks'

export type StTicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed'
export type StTicketAction = 'reabrir' | 'cerrar'

export interface StTicketAttachment {
  id: number
  ticket_id: number
  file_path: string
  file_name: string
  file_type: string
  url?: string
}

export interface StTicketLink {
  stTicketId: number
  ownerUid: string
  requesterEmail: string
  requesterNombre: string
  title: string
  description: string
  priority: string
  departmentId: number
  departmentName?: string | null
  categoryId: number
  categoryName?: string | null
  status: StTicketStatus
  attachments: StTicketAttachment[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface StTicketComment {
  id: number
  ticket_id: number
  texto: string
  created_at: string
  authorLabel: string
  isRequester?: boolean
  authorRole?: string | null
  isStaff?: boolean
}
