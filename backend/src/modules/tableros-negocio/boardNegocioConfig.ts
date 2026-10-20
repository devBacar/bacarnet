/**
 * Carpeta de Drive del tablero "Finanzas – Negocio" dentro del contenedor de Tableros. El nombre de la tarjeta lo da la
 * carpeta. El tablero es React (como RRHH) y el acceso se da con el botón "Acceso" de Tableros (colección boardAccess).
 * Los datos son el archivo `datos.json` dentro de esa misma carpeta.
 * Producción: backend/.env.bacar-web. Local: backend/.env.local.
 */
export function getNegocioBoardFolderId(): string {
  return process.env.NEGOCIO_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroNegocioConfigurado(): boolean {
  return Boolean(getNegocioBoardFolderId())
}
