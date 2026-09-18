export type HelpdeskEmailLogSourceDto = 'bacarnet' | 'n8n_callback' | null

const TIPO_LABELS: Record<string, string> = {
  difusion_inicial: 'Difusión inicial al solicitante',
  invitacion_reunion: 'Invitación / aviso de reunión',
  actualizacion_estado: 'Actualización de estado',
  recordatorio: 'Recordatorio',
  analisis_pendiente_aprobacion: 'Análisis pendiente de aprobación',
  analisis_aprobado: 'Análisis aprobado (aviso interno)',
  analisis_rechazado: 'Análisis rechazado (aviso interno)',
  aviso_interno_ticket: 'Aviso interno — ticket nuevo',
  aviso_interno_reunion: 'Aviso interno — reunión creada',
  colaborador_sistemas_agregado: 'Colaborador Sistemas agregado',
  colaborador_solicitante_agregado: 'Colaborador del solicitante agregado',
}

export function helpdeskEmailLogTipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo.replaceAll('_', ' ')
}

export function helpdeskEmailLogSourceLabel(source: HelpdeskEmailLogSourceDto | undefined): string {
  if (source === 'bacarnet') return 'Bacarnet'
  if (source === 'n8n_callback') return 'n8n (callback)'
  return 'n8n (callback)'
}
