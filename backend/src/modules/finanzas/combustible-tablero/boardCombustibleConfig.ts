/**
 * Carpeta de Drive del tablero "Combustible" dentro del contenedor de Tableros (mismo patrón que
 * boardVentasConfig.ts). El tablero es React (no HTML de Drive); el acceso se da con el botón
 * "Acceso" de Tableros (colección boardAccess).
 *
 * Al crear este módulo (04/11) no existe todavía una carpeta real en el Drive compartido de
 * producción para "Combustible", así que COMBUSTIBLE_BOARD_FOLDER_ID queda vacío y el tablero NO
 * aparece listado en /tableros hasta que se cree esa carpeta y se configure el env var en el deploy.
 * Mientras tanto solo es visible entrando directo a /tableros/combustible siendo super admin.
 */
export function getCombustibleBoardFolderId(): string {
  return process.env.COMBUSTIBLE_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroCombustibleConfigurado(): boolean {
  return Boolean(getCombustibleBoardFolderId())
}
