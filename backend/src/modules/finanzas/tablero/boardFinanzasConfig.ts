/**
 * Carpeta de Drive del tablero "Finanzas" dentro del contenedor de Tableros. Es un placeholder: el tablero es React
 * (como RRHH) y el acceso se da con el botón "Acceso" de Tableros (colección boardAccess).
 * No exige el permiso del módulo Finanzas: la dirección puede ver el tablero sin usar el módulo.
 * Producción: backend/.env.bacar-web. Local: backend/.env.local.
 */
export function getFinanzasBoardFolderId(): string {
  return process.env.FINANZAS_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroFinanzasConfigurado(): boolean {
  return Boolean(getFinanzasBoardFolderId())
}
