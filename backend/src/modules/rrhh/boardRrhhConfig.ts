/**
 * Carpeta de Drive del tablero "RRHH" dentro del contenedor de Tableros. Es un placeholder: el tablero es React
 * (como Desarrollo · Proyectos) y el acceso se da con el botón "Acceso" de Tableros (colección boardAccess).
 * Producción: backend/.env.bacar-web. Local: backend/.env.local.
 */
export function getRrhhBoardFolderId(): string {
  return process.env.RRHH_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroRrhhConfigurado(): boolean {
  return Boolean(getRrhhBoardFolderId())
}
