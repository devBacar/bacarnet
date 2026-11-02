/**
 * Carpeta de Drive del tablero "COSP" dentro del contenedor de Tableros. Es un placeholder: el tablero es React
 * (como RRHH/Finanzas) y el acceso se da con el botón "Acceso" de Tableros (colección boardAccess).
 * Producción: backend/.env.bacar-web. Local: backend/.env.local.
 */
export function getCopsBoardFolderId(): string {
  return process.env.COPS_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroCopsConfigurado(): boolean {
  return Boolean(getCopsBoardFolderId())
}
