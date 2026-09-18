export function getHelpdeskBoardProyectosFolderId(): string {
  return process.env.HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim() || ''
}

export function isHelpdeskBoardProyectosConfigured(): boolean {
  return Boolean(getHelpdeskBoardProyectosFolderId())
}
