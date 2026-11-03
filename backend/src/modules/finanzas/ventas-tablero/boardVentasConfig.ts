/**
 * Carpeta de Drive del tablero "Ventas" dentro del contenedor de Tableros (mismo patrón que
 * boardFinanzasConfig.ts). El tablero es React (no HTML de Drive); el acceso se da con el botón
 * "Acceso" de Tableros (colección boardAccess).
 *
 * IMPORTANTE: al crear este módulo (03/11) no existe todavía una carpeta real en el Drive compartido
 * de producción para "Ventas", así que VENTAS_BOARD_FOLDER_ID queda vacío y el tablero NO aparece
 * listado en /tableros (listBoards.ts arma la grilla a partir de carpetas reales de Drive). Hasta que
 * se cree esa carpeta y se configure el env var en el deploy, solo es visible entrando directo a
 * /tableros/ventas siendo super admin (bypass de requireTableroVentas). Esto no se puede resolver
 * solo con código: requiere crear la carpeta en Drive y configurar el env var.
 */
export function getVentasBoardFolderId(): string {
  return process.env.VENTAS_BOARD_FOLDER_ID?.trim() || ''
}

export function tableroVentasConfigurado(): boolean {
  return Boolean(getVentasBoardFolderId())
}
