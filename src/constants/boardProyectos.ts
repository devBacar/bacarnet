/** ID carpeta Drive del tablero (mismo valor que HELPDESK_BOARD_PROYECTOS_FOLDER_ID en backend). */
export const DESARROLLO_PROYECTOS_BOARD_FOLDER_ID =
  import.meta.env.VITE_HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim() ?? ''

export function isDesarrolloProyectosBoard(boardId: string): boolean {
  return Boolean(
    DESARROLLO_PROYECTOS_BOARD_FOLDER_ID && boardId === DESARROLLO_PROYECTOS_BOARD_FOLDER_ID,
  )
}

/** ID carpeta Drive del tablero React de RRHH (mismo valor que RRHH_BOARD_FOLDER_ID en backend). */
export const RRHH_BOARD_FOLDER_ID = import.meta.env.VITE_RRHH_BOARD_FOLDER_ID?.trim() ?? ''

export function isRrhhBoard(boardId: string): boolean {
  return Boolean(RRHH_BOARD_FOLDER_ID && boardId === RRHH_BOARD_FOLDER_ID)
}

export function boardListHref(boardId: string): string {
  if (isDesarrolloProyectosBoard(boardId)) return '/tableros/desarrollo-proyectos'
  if (isRrhhBoard(boardId)) return '/tableros/rrhh'
  return `/tableros/${boardId}`
}
