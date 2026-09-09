import type { GeminiFunctionDeclaration } from './vertexGemini.js'

export const RAG_AUDIT_TOOL_DECLARATION: GeminiFunctionDeclaration = {
  name: 'query_audit_logs',
  description:
    'Consulta el registro de auditoría interno: quién aprobó qué, permisos otorgados/revocados, cambios en archivos o usuarios, etc. ' +
    'Solo disponible para administradores. Podés llamarla sin fechas (últimos 90 días por defecto).',
  parameters: {
    type: 'object',
    properties: {
      actorEmail: {
        type: 'string',
        description: 'Filtrar por email de quien realizó la acción.',
      },
      action: {
        type: 'string',
        description:
          'Tipo de acción: permission_grant, permission_revoke, approval, create, delete, rename, classification_change, etc.',
      },
      targetName: {
        type: 'string',
        description: 'Nombre parcial del archivo, carpeta o recurso afectado.',
      },
      dateFrom: {
        type: 'string',
        description: 'Fecha inicial inclusive (YYYY-MM-DD).',
      },
      dateTo: {
        type: 'string',
        description: 'Fecha final inclusive (YYYY-MM-DD). Opcional.',
      },
      fileKind: {
        type: 'string',
        description: 'Filtrar por tipo legible: PDF, Word, Texto, etc.',
      },
      limit: {
        type: 'number',
        description: 'Cantidad máxima de eventos (hasta 25).',
      },
    },
  },
}

export const RAG_METADATA_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'search_document_content',
    description:
      'Busca en el contenido textual indexado de documentos de las áreas habilitadas. ' +
      'Usala para preguntas sobre procedimientos, instrucciones, configuraciones o cualquier tema que requiera leer el texto de los archivos.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Consulta de búsqueda semántica sobre el contenido de los documentos.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'count_files_by_type',
    description:
      'Cuenta archivos visibles para el usuario, agrupados por tipo (documento, PDF, hoja de cálculo, etc.). ' +
      'Usala para preguntas de inventario del tipo "¿cuántos archivos hay?" o "¿cuántos PDF hay?".',
    parameters: {
      type: 'object',
      properties: {
        areaLabel: {
          type: 'string',
          description:
            'Nombre del área a consultar. Omitir para usar las áreas habilitadas para el usuario.',
        },
      },
    },
  },
  {
    name: 'get_storage_usage',
    description:
      'Calcula el espacio total ocupado por archivos visibles para el usuario.',
    parameters: {
      type: 'object',
      properties: {
        areaLabel: {
          type: 'string',
          description: 'Nombre del área. Omitir para usar las áreas habilitadas para el usuario.',
        },
      },
    },
  },
  {
    name: 'list_files_by_date_range',
    description:
      'Lista archivos cargados o modificados en un rango de fechas (ISO YYYY-MM-DD), solo los visibles para el usuario.',
    parameters: {
      type: 'object',
      properties: {
        dateFrom: {
          type: 'string',
          description: 'Fecha inicial inclusive en formato YYYY-MM-DD.',
        },
      dateTo: {
        type: 'string',
        description: 'Fecha final inclusive en formato YYYY-MM-DD. Opcional.',
      },
      fileKind: {
        type: 'string',
        description: 'Filtrar por tipo legible: PDF, Word, Texto, etc.',
      },
      areaLabel: {
        type: 'string',
        description: 'Nombre del área. Omitir para usar las áreas habilitadas para el usuario.',
      },
    },
  },
  },
  {
    name: 'get_file_uploader',
    description:
      'Indica quién subió o creó un archivo puntual, buscando por nombre.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Nombre del archivo (completo o parcial).',
        },
        fileId: {
          type: 'string',
          description: 'ID de Google Drive del archivo, si se conoce.',
        },
      },
    },
  },
  {
    name: 'list_accessible_files',
    description:
      'Lista TODOS los archivos visibles del área con nombre y tipo (PDF, Word, etc.). ' +
      'Usala cuando pregunten "¿qué archivos tengo?", "mi carpeta", o necesiten un listado completo. ' +
      'Preferila sobre get_inventory_summary o list_files_by_date_range para listados generales.',
    parameters: {
      type: 'object',
      properties: {
        fileKind: {
          type: 'string',
          description: 'Filtrar opcionalmente por tipo legible: PDF, Word, Texto, etc.',
        },
        limit: {
          type: 'number',
          description: 'Cantidad máxima de archivos a devolver (default 150, máx 200).',
        },
        areaLabel: {
          type: 'string',
          description: 'Nombre del área. Omitir para usar las áreas habilitadas para el usuario.',
        },
      },
    },
  },
  {
    name: 'get_inventory_summary',
    description:
      'Resume el inventario de metadata: carpetas visitadas, archivos por tipo, espacio total y archivo más reciente. ' +
      'No resume el contenido textual de los documentos.',
    parameters: {
      type: 'object',
      properties: {
        areaLabel: {
          type: 'string',
          description: 'Nombre del área. Omitir para usar las áreas habilitadas para el usuario.',
        },
      },
    },
  },
  {
    name: 'summarize_document',
    description:
      'Resume el contenido completo indexado de UN archivo específico (no solo fragmentos relevantes a una pregunta). ' +
      'Usala cuando pidan "resumime este documento/PDF/manual". ' +
      'Para varios archivos, identificá primero cuáles son (p. ej. list_files_by_date_range con fileKind PDF) y llamá esta herramienta una vez por cada uno.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Nombre del archivo (completo o parcial).',
        },
        focus: {
          type: 'string',
          description: 'Enfoque opcional del resumen (ej. "instalación", "requisitos", "pasos principales").',
        },
      },
      required: ['fileName'],
    },
  },
]

export const RAG_ACTION_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'prepare_email_draft',
    description:
      'Prepara un borrador de correo electrónico para que el usuario lo revise y confirme en la interfaz. ' +
      'NO envía el correo: solo crea el borrador pendiente de confirmación. ' +
      'Destinatarios deben ser cuentas corporativas @bacarsa.com.ar.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Destinatarios principales (emails @bacarsa.com.ar).',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Copia opcional (emails @bacarsa.com.ar).',
        },
        subject: {
          type: 'string',
          description: 'Asunto del correo.',
        },
        body: {
          type: 'string',
          description: 'Cuerpo del correo en texto plano.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'prepare_calendar_event',
    description:
      'Prepara un borrador de evento de calendario para revisión y confirmación del usuario. ' +
      'NO crea el evento: solo el borrador pendiente. Invitados pueden ser de cualquier dominio.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Título del evento.',
        },
        startDateTime: {
          type: 'string',
          description: 'Inicio en ISO 8601 (ej. 2026-09-10T10:00:00).',
        },
        endDateTime: {
          type: 'string',
          description: 'Fin en ISO 8601.',
        },
        description: {
          type: 'string',
          description: 'Descripción opcional.',
        },
        location: {
          type: 'string',
          description: 'Ubicación opcional.',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Invitados (cualquier email válido). Reciben invitación real al confirmar.',
        },
        attendeeEmail: {
          type: 'string',
          description: 'Un invitado puntual si no usás el array attendees.',
        },
        addGoogleMeet: {
          type: 'boolean',
          description: 'Si true, crea un enlace de Google Meet al confirmar el evento.',
        },
      },
      required: ['title', 'startDateTime', 'endDateTime'],
    },
  },
]

export const RAG_GMAIL_READ_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'list_inbox_today',
    description:
      'Lista correos de la bandeja de entrada recibidos hoy para el usuario autenticado (solo lectura). ' +
      'Usala para "¿qué correos tengo hoy?" o similar.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_emails',
    description:
      'Busca correos en la bandeja de entrada del usuario autenticado por remitente, asunto o query Gmail (solo lectura).',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Filtrar por remitente (email o fragmento).',
        },
        subject: {
          type: 'string',
          description: 'Filtrar por asunto (fragmento).',
        },
        query: {
          type: 'string',
          description: 'Query adicional de búsqueda Gmail (ej. is:unread).',
        },
      },
    },
  },
  {
    name: 'summarize_email',
    description:
      'Resume el contenido de un correo puntual del usuario autenticado (solo lectura). ' +
      'Requiere messageId o subject para identificar el correo.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'ID del mensaje Gmail.',
        },
        subject: {
          type: 'string',
          description: 'Asunto aproximado si no hay messageId.',
        },
      },
    },
  },
]

export const RAG_CALENDAR_READ_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'list_calendar_events',
    description:
      'Lista eventos del calendario primario del usuario autenticado en un rango de fechas. ' +
      'Usala para preguntas como "¿qué tengo hoy/mañana/esta semana?".',
    parameters: {
      type: 'object',
      properties: {
        dateFrom: {
          type: 'string',
          description: 'Fecha inicial inclusive YYYY-MM-DD. Omitir para hoy.',
        },
        dateTo: {
          type: 'string',
          description: 'Fecha final inclusive YYYY-MM-DD. Omitir para mismo día que dateFrom.',
        },
      },
    },
  },
  {
    name: 'find_calendar_free_slots',
    description:
      'Busca huecos libres en el calendario primario del usuario autenticado dentro del horario laboral.',
    parameters: {
      type: 'object',
      properties: {
        dateFrom: {
          type: 'string',
          description: 'Fecha inicial YYYY-MM-DD. Omitir para hoy.',
        },
        dateTo: {
          type: 'string',
          description: 'Fecha final YYYY-MM-DD. Omitir para mismo día.',
        },
        durationMinutes: {
          type: 'number',
          description: 'Duración mínima del hueco libre (15-240 min). Default 30.',
        },
        workDayStart: {
          type: 'string',
          description: 'Inicio jornada HH:MM. Default 09:00.',
        },
        workDayEnd: {
          type: 'string',
          description: 'Fin jornada HH:MM. Default 18:00.',
        },
      },
    },
  },
]

export function buildRagToolDeclarations(includeAudit: boolean): GeminiFunctionDeclaration[] {
  const base = [
    ...RAG_METADATA_TOOL_DECLARATIONS,
    ...RAG_GMAIL_READ_TOOL_DECLARATIONS,
    ...RAG_CALENDAR_READ_TOOL_DECLARATIONS,
    ...RAG_ACTION_TOOL_DECLARATIONS,
  ]
  if (!includeAudit) return base
  return [...base, RAG_AUDIT_TOOL_DECLARATION]
}
