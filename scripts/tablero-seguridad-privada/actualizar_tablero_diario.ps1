# =====================================================================
#  Tablero "Seguridad Privada" (HTML estatico en Drive, carpeta
#  Tableros Gerencia > Financiero > Seguridad Privada).
#
#  Encadena, en un solo paso:
#   1. Tres consultas chicas y de solo lectura contra la base de Vientri
#      (comprobantes, ventas_items y gastos de Seguridad) - NO vuelve a
#      correr el export completo de Bacarnet (eso ya lo hace, aparte,
#      D:\inventario_vientri\automatizacion\SIS5\actualizar_y_exportar.ps1):
#      se apoya en que esa tarea ya dejo la base local al dia.
#   2. leer-rrhh.mjs: lee Firestore de produccion (sueldos agregados por
#      centro de costo, sin nombres) - requiere la service account de RRHH.
#   3. actualizar-facturacion.mjs: arma el index.html nuevo a partir del
#      que ya esta en Drive, con tot.fact/iibb/hf/hp/mo frescos.
#   4. Reemplaza el index.html en Drive (solo si -IndexHtml apunta ahi).
#
#  Manejo de errores (mismo criterio que actualizar_y_exportar.ps1): un
#  fallo en cualquier paso queda en el log y hace que el script termine
#  con error, pero NUNCA toca ni interfiere con el export principal de
#  Vientri (no escribe en sus carpetas, no corre las mismas consultas
#  pesadas, es una tarea programada aparte). Los pasos son best-effort
#  entre si donde tiene sentido: si falla leer-rrhh.mjs (por ejemplo,
#  Firestore no disponible un rato), igual se actualiza facturacion/IIBB/
#  horas facturadas con lo que si se pudo traer, en vez de no actualizar
#  nada.
#
#  NO toca "otros gastos" (tot.otros) ni "gastos generales" (tot.est):
#  siguen bloqueados (ver el encabezado de actualizar-facturacion.mjs).
#
#  Uso:
#    powershell -NoProfile -ExecutionPolicy Bypass -File .\actualizar_tablero_diario.ps1 `
#      -IndexHtml "<ruta al index.html real en Drive>"
#
#  Para probarlo sin pisar el archivo real de Drive, pasar -IndexHtml apuntando
#  a una copia de prueba: el script nunca "sube" nada aparte, solo lee y
#  reescribe el archivo que le pasaste en -IndexHtml.
#
#  Tarea programada diaria (NO ejecutar esto solo; lo registra el usuario desde
#  su propia sesion de Windows en SIS5, con el Programador de tareas o con
#  schtasks). Pensada para correr despues de que termine la tarea existente
#  "Bacarnet - actualizar y exportar Vientri" (05:00), para que la base local
#  ya este al dia: por ejemplo 06:00 todos los dias.
#
#    schtasks /Create /TN "Bacarnet - actualizar tablero Seguridad Privada" /SC DAILY /ST 06:00 `
#      /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\inventario_vientri\exportador\..\..\intranet1\scripts\tablero-seguridad-privada\actualizar_tablero_diario.ps1"" -IndexHtml ""<ruta real del index.html en Drive montado, ej. I:\...\Seguridad Privada\index.html>""" `
#      /RU "Admin" /RL LIMITED
#
#  Reemplazar la ruta del -File por donde quede clonado este repo en SIS5, y la
#  ruta de -IndexHtml por la ruta real del archivo en el Drive montado en esa
#  PC (I:\... ; se puede ver click derecho > Copiar ruta de acceso en el
#  Explorador, parado en el index.html de la carpeta Seguridad Privada).
# =====================================================================
param(
    [string]$Servidor = "(localdb)\MSSQLLocalDB",
    [string]$Base = "SGA_BACAR",
    [Parameter(Mandatory = $true)]
    [string]$IndexHtml,                  # ruta al index.html a actualizar (Drive montado en produccion, un archivo de prueba al probar)
    [string]$Salida = "D:\inventario_vientri\exportaciones\seguridad_privada",
    [string]$ServiceAccount = "C:\Users\Admin\.bacarsa\firebase-admin-sa.json"
)

$ErrorActionPreference = 'Stop'
$Carpeta = Join-Path $PSScriptRoot '.'
$sello = Get-Date -Format 'yyyyMMdd_HHmm'
$carpetaSalida = Join-Path $Salida $sello
New-Item -ItemType Directory -Force $carpetaSalida | Out-Null
$Logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
$log = Join-Path $Logs ("tablero_$sello.log")
function Log([string]$m) {
    $linea = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $m
    Add-Content -Encoding UTF8 -Path $log -Value $linea
    Write-Host $linea
}

function Correr-Sql([string]$archivoSql, [string]$destinoCsv) {
    $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$Servidor;Database=$Base;Integrated Security=True;Application Name=TableroSeguridadPrivada;Connect Timeout=60")
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = [System.IO.File]::ReadAllText($archivoSql)
        $cmd.CommandTimeout = 1200
        if ($cmd.CommandText -match '@desde') {
            $p = $cmd.Parameters.Add('@desde', [System.Data.SqlDbType]::DateTime)
            $p.Value = [System.DBNull]::Value
        }
        $r = $cmd.ExecuteReader()
        $w = New-Object System.IO.StreamWriter($destinoCsv, $false, (New-Object System.Text.UTF8Encoding($false)))
        $w.NewLine = "`n"
        $cols = @(); for ($i = 0; $i -lt $r.FieldCount; $i++) { $cols += $r.GetName($i) }
        $w.WriteLine(($cols -join ';'))
        $filas = 0
        $vals = New-Object object[] $r.FieldCount
        while ($r.Read()) {
            [void]$r.GetValues($vals)
            $linea = New-Object string[] $r.FieldCount
            for ($i = 0; $i -lt $r.FieldCount; $i++) {
                $v = $vals[$i]
                if ($v -is [System.DBNull]) { $linea[$i] = '' }
                elseif ($v -is [datetime]) { $linea[$i] = $v.ToString('yyyy-MM-dd') }
                elseif ($v -is [decimal] -or $v -is [double]) { $linea[$i] = $v.ToString([System.Globalization.CultureInfo]::InvariantCulture) }
                else { $linea[$i] = [string]$v -replace '[\r\n]', ' ' }
            }
            $w.WriteLine(($linea -join ';'))
            $filas++
        }
        $w.Close(); $r.Close()
        Log ("{0,-24} {1,8} filas" -f (Split-Path $destinoCsv -Leaf), $filas)
        return $filas
    } finally {
        $cn.Close()
    }
}

Log "Inicio. Salida: $carpetaSalida"
$resultado = 0
$tieneGastos = $false
$tieneItems = $false
$tieneRrhh = $false

try {
    # 1a. Comprobantes (misma consulta que usa el export diario de Bacarnet). En produccion (SIS5) la copia real
    # del exportador vive en D:\inventario_vientri\exportador\, no en una carpeta hermana de este script; en el
    # repo (para probar desde un worktree) se usa la ruta relativa a scripts\vientri-export\.
    $comprobantesSql = 'D:\inventario_vientri\exportador\sql\02_comprobantes.sql'
    if (-not (Test-Path $comprobantesSql)) { $comprobantesSql = Join-Path $Carpeta '..\vientri-export\sql\02_comprobantes.sql' }
    Correr-Sql $comprobantesSql (Join-Path $carpetaSalida 'comprobantes.csv') | Out-Null
} catch {
    Log "ERROR fatal trayendo comprobantes.csv: $_"
    Log "No se puede seguir sin comprobantes (hace falta para facturacion, IIBB se puede calcular igual pero horas facturadas no)."
    exit 1
}

try {
    # 1b. Gastos de Seguridad (IIBB).
    Correr-Sql (Join-Path $Carpeta 'sql\gastos_seguridad.sql') (Join-Path $carpetaSalida 'gastos_seguridad.csv') | Out-Null
    $tieneGastos = $true
} catch {
    Log "AVISO: no se pudieron traer los gastos de Seguridad (sigue sin actualizarse Ingresos Brutos): $_"
}

try {
    # 1c. Renglones de factura (horas facturadas). Consulta de produccion, no vive en este repo (ver cabecera
    # de actualizar-facturacion.mjs): si esta ruta cambia de lugar, hay que actualizarla aca.
    $ventasItemsSql = 'D:\inventario_vientri\exportador\sql\11_ventas_items.sql'
    if (Test-Path $ventasItemsSql) {
        Correr-Sql $ventasItemsSql (Join-Path $carpetaSalida 'ventas_items.csv') | Out-Null
        $tieneItems = $true
    } else {
        Log "AVISO: no encontre $ventasItemsSql (sigue sin actualizarse horas facturadas)."
    }
} catch {
    Log "AVISO: no se pudieron traer los renglones de factura (sigue sin actualizarse horas facturadas): $_"
}

$rrhhJson = Join-Path $carpetaSalida 'rrhh_seguridad.json'
try {
    # 2. Sueldos/horas de RRHH (Firestore de produccion).
    & node (Join-Path $Carpeta 'leer-rrhh.mjs') --sa $ServiceAccount --out $rrhhJson
    if ($LASTEXITCODE -ne 0) { throw "leer-rrhh.mjs termino con codigo $LASTEXITCODE" }
    $tieneRrhh = $true
} catch {
    Log "AVISO: no se pudo leer RRHH (sigue sin actualizarse sueldos/horas pagadas): $_"
}

try {
    # 3. Arma el HTML nuevo.
    $args = @(
        (Join-Path $Carpeta 'actualizar-facturacion.mjs'),
        '--comprobantes', (Join-Path $carpetaSalida 'comprobantes.csv'),
        '--html', $IndexHtml,
        '--out', $IndexHtml
    )
    if ($tieneGastos) { $args += @('--gastos', (Join-Path $carpetaSalida 'gastos_seguridad.csv')) }
    if ($tieneItems) { $args += @('--items', (Join-Path $carpetaSalida 'ventas_items.csv')) }
    if ($tieneRrhh) { $args += @('--rrhh', $rrhhJson) }
    & node @args
    if ($LASTEXITCODE -ne 0) { throw "actualizar-facturacion.mjs termino con codigo $LASTEXITCODE" }
    Log "Tablero actualizado: $IndexHtml"
} catch {
    Log "ERROR fatal armando/escribiendo el HTML: $_"
    $resultado = 1
}

Get-ChildItem $Salida -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $Logs -Filter 'tablero_*.log' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
Log "Fin (resultado=$resultado)"
exit $resultado
