/** ID carpeta Drive del tablero (mismo valor que HELPDESK_BOARD_PROYECTOS_FOLDER_ID en backend). */
export const DESARROLLO_PROYECTOS_BOARD_FOLDER_ID =
  import.meta.env.VITE_HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim() ?? ''

export function isDesarrolloProyectosBoard(boardId: string): boolean {
  return Boolean(
    DESARROLLO_PROYECTOS_BOARD_FOLDER_ID && boardId === DESARROLLO_PROYECTOS_BOARD_FOLDER_ID,
  )
}

/** Los tableros de RRHH, Finanzas y Negocio los marca el backend: no hace falta configurar su ID en el frontend. */
export function boardListHref(boardId: string, tipo?: 'rrhh' | 'finanzas' | 'negocio'): string {
  if (tipo === 'rrhh') return '/tableros/rrhh'
  if (tipo === 'finanzas') return '/tableros/finanzas'
  if (tipo === 'negocio') return '/tableros/negocio'
  if (isDesarrolloProyectosBoard(boardId)) return '/tableros/desarrollo-proyectos'
  return `/tableros/${boardId}`
}
