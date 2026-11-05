/**
 * Carpeta de Drive del tablero "Cobros" dentro del contenedor de Tableros (mismo patrón que
 * boardVentasConfig.ts / boardCombustibleConfig.ts). El tablero es React; el acceso se da con el
 * botón "Acceso" de Tableros (colección boardAccess).
 *
 * IMPORTANTE: al crear este módulo todavía no existe una carpeta real en el Drive compartido de
 * producción para "Cobros", así que COBROS_BOARD_FOLDER_ID queda vacío y el tablero NO aparece
 * listado en /tableros (listBoards.ts arma la grilla a partir de carpetas reales de Drive). Hasta
 * que se cree esa carpeta y se configure el env var en el deploy, solo es visible entrando directo
 * a /tableros/cobros siendo super admin (bypass de requireTableroCobros). Esto no se puede resolver
 * solo con código: requiere crear la carpeta en Drive y configurar el env var.
 */
export function getCobrosBoardFolderId(): string {
  return process.env.COBROS_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroCobrosConfigurado(): boolean {
  return Boolean(getCobrosBoardFolderId())
}
