/** ID carpeta Drive del tablero (mismo valor que HELPDESK_BOARD_PROYECTOS_FOLDER_ID en backend). */
export const DESARROLLO_PROYECTOS_BOARD_FOLDER_ID =
  import.meta.env.VITE_HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim() ?? ''

export function isDesarrolloProyectosBoard(boardId: string): boolean {
  return Boolean(
    DESARROLLO_PROYECTOS_BOARD_FOLDER_ID && boardId === DESARROLLO_PROYECTOS_BOARD_FOLDER_ID,
  )
}

export function boardListHref(boardId: string): string {
  if (isDesarrolloProyectosBoard(boardId)) return '/tableros/desarrollo-proyectos'
  return `/tableros/${boardId}`
}
