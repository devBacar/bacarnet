<#
  Exporta los CSV de Vientri para Bacarnet Finanzas (contrato de datos v0.3).
  v0.3: suma id_unegocio/nombre_cf en comprobantes.csv y los archivos 20_items/21_unegocio/22_art
  (facturacion por unidad de negocio e item, para el tablero de Ventas de Bacarnet).
  Solo LEE la copia de SGA_BACAR adjunta en LocalDB. Nunca se conecta a VIENTRISRV ni escribe en Vientri.

  Uso (PowerShell en SIS5; la politica de ejecucion bloquea los .ps1 si se llaman directo: usar "powershell -NoProfile -ExecutionPolicy Bypass -File"):
    powershell -NoProfile -ExecutionPolicy Bypass -File .\exportar_vientri.ps1 -ListarBases
    powershell -NoProfile -ExecutionPolicy Bypass -File .\exportar_vientri.ps1 -Base SGA_BACAR -FechaDatos "2026-10-15T10:04:00"
    powershell -NoProfile -ExecutionPolicy Bypass -File .\exportar_vientri.ps1 -Base SGA_BACAR -Desde "2026-10-14T00:00:00"     (incremental)

  Formato: separador ;  UTF-8 sin BOM, con encabezado, fin de linea \n,
  fechas AAAA-MM-DD, fecha-hora AAAA-MM-DDTHH:MM:SS, decimales con punto, booleanos 0/1, nulo = vacio.
  Los archivos tienen datos personales (CUIT, nombres, importes): guardarlos solo en carpetas restringidas.

  Numeracion de sql\: 01-10 y 20-29 van al zip de Bacarnet (vientri_<sello>). 11-19 estan RESERVADOS
  para las consultas de otros tableros (Finanzas-Negocio, Seguridad Privada): van a una carpeta aparte
  (tableros_<sello>) que nunca entra en el zip de Bacarnet. No reusar 11-19 para nada de Bacarnet.
#>
param(
    [string]$Servidor = "(localdb)\MSSQLLocalDB",
    [string]$Base = "SGA_BACAR",
    [string]$Salida = "D:\inventario_vientri\exportaciones",
    [string]$Desde = "",
    [string]$FechaDatos = "",
    [string]$CarpetaDrive = "",
    [switch]$SinTableros,        # no exporta las consultas de tableros (sql\11_ a 19_)
    [switch]$ListarBases
)

$ErrorActionPreference = "Stop"
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$utf8 = New-Object System.Text.UTF8Encoding($false)
$versionContrato = "0.3"

function Abrir-Conexion([string]$base) {
    $cs = "Server=$Servidor;Database=$base;Integrated Security=True;Application Name=ExportVientriBacarnet;Connect Timeout=60"
    $cn = New-Object System.Data.SqlClient.SqlConnection($cs)
    $cn.Open()
    return $cn
}

if ($ListarBases) {
    $cn = Abrir-Conexion "master"
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = "SELECT name, create_date FROM sys.databases ORDER BY name"
    $r = $cmd.ExecuteReader()
    while ($r.Read()) { Write-Host ("{0}  (creada {1})" -f $r.GetString(0), $r.GetDateTime(1)) }
    $r.Close(); $cn.Close()
    return
}

function Formatear($v) {
    if ($v -eq $null -or $v -is [System.DBNull]) { return "" }
    if ($v -is [bool]) { if ($v) { return "1" } else { return "0" } }
    if ($v -is [decimal] -or $v -is [double] -or $v -is [single]) { return $v.ToString($inv) }
    if ($v -is [datetime]) { return $v.ToString("yyyy-MM-ddTHH:mm:ss", $inv) }
    if ($v -is [string]) {
        $s = $v.Trim() -replace "[\r\n\t]+", " "
        if ($s.Contains(";") -or $s.Contains('"')) { $s = '"' + $s.Replace('"', '""') + '"' }
        return $s
    }
    return [string]::Format($inv, "{0}", $v)
}

$sqlDir = Join-Path $PSScriptRoot "sql"
$sello = Get-Date -Format "yyyyMMdd_HHmm"
$carpeta = Join-Path $Salida ("vientri_" + $sello)
New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
$log = Join-Path $carpeta "_exportacion.log"
function Log([string]$m) { $l = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $m; Write-Host $l; Add-Content -Path $log -Value $l -Encoding UTF8 }

$modo = "completo"
$desdeVal = [System.DBNull]::Value
if ($Desde -ne "") { $modo = "incremental"; $desdeVal = [datetime]::Parse($Desde, $inv) }

Log "Base: $Servidor / $Base   modo: $modo   salida: $carpeta"
$cn = Abrir-Conexion $Base
$control = New-Object System.Collections.Generic.List[string]
$maxGlobal = ""

foreach ($f in (Get-ChildItem -Path $sqlDir -Filter "*.sql" | Where-Object { $_.Name -match '^(0[1-9]|10|2[0-9])_' } | Sort-Object Name)) {
    $nombre = ($f.BaseName -replace "^\d+_", "") + ".csv"
    $ruta = Join-Path $carpeta $nombre
    $inicio = Get-Date
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = [System.IO.File]::ReadAllText($f.FullName)
    $cmd.CommandTimeout = 1200
    $p = $cmd.Parameters.Add("@desde", [System.Data.SqlDbType]::DateTime)
    $p.Value = $desdeVal
    $r = $cmd.ExecuteReader()
    $w = New-Object System.IO.StreamWriter($ruta, $false, $utf8)
    $w.NewLine = "`n"
    $cols = @(); for ($i = 0; $i -lt $r.FieldCount; $i++) { $cols += $r.GetName($i) }
    $w.WriteLine(($cols -join ";"))
    $iImp = -1
    foreach ($c in @("total", "importe", "cotizacion")) { if ($iImp -lt 0) { $iImp = [array]::IndexOf($cols, $c) } }
    $iFec = [array]::IndexOf($cols, "fecsys")
    $filas = 0; $suma = [decimal]0; $maxFec = ""
    $vals = New-Object object[] $r.FieldCount
    while ($r.Read()) {
        [void]$r.GetValues($vals)
        $linea = New-Object string[] $r.FieldCount
        for ($i = 0; $i -lt $r.FieldCount; $i++) { $linea[$i] = Formatear $vals[$i] }
        $w.WriteLine(($linea -join ";"))
        $filas++
        if ($iImp -ge 0 -and -not ($vals[$iImp] -is [System.DBNull])) { $suma += [decimal]$vals[$iImp] }
        if ($iFec -ge 0 -and -not ($vals[$iFec] -is [System.DBNull])) { $fs = [string]$vals[$iFec]; if ($fs -gt $maxFec) { $maxFec = $fs } }
    }
    $w.Close(); $r.Close()
    if ($maxFec -gt $maxGlobal -and $maxFec -lt "2100") { $maxGlobal = $maxFec }
    $seg = [int]((Get-Date) - $inicio).TotalSeconds
    Log ("{0,-24} {1,9} filas  {2,4} s" -f $nombre, $filas, $seg)
    $control.Add(($nombre, $filas, $suma.ToString($inv), $maxFec) -join ";")
}
$cn.Close()

if ($FechaDatos -eq "") { $FechaDatos = $maxGlobal; Log "FechaDatos no indicada: se usa la ultima modificacion encontrada ($FechaDatos)" }
$desdeTxt = ""; if ($modo -eq "incremental") { $desdeTxt = $desdeVal.ToString("yyyy-MM-ddTHH:mm:ss", $inv) }
$cw = New-Object System.IO.StreamWriter((Join-Path $carpeta "_control.csv"), $false, $utf8)
$cw.NewLine = "`n"
$cw.WriteLine("archivo;filas;suma_importe;max_fecsys;fecha_datos;modo;desde_fecsys;version_contrato")
foreach ($l in $control) { $cw.WriteLine(($l, $FechaDatos, $modo, $desdeTxt, $versionContrato) -join ";") }
$cw.Close()
Log "Listo. _control.csv escrito (fecha de los datos: $FechaDatos)"

# ---------------------------------------------------------------------------------------------
# Consultas para los tableros (sql\11_ a 19_). Van a una carpeta APARTE (tableros_<sello>), nunca dentro de
# vientri_<sello>, para que no entren en el zip de Bacarnet. Un error aca no afecta a la exportacion de arriba.
# ---------------------------------------------------------------------------------------------
if (-not $SinTableros) {
    $carpetaT = Join-Path $Salida ("tableros_" + $sello)
    try {
        New-Item -ItemType Directory -Force -Path $carpetaT | Out-Null
        $cnT = Abrir-Conexion $Base
        $ctlT = New-Object System.Collections.Generic.List[string]
        foreach ($f in (Get-ChildItem -Path $sqlDir -Filter "*.sql" | Where-Object { $_.Name -match '^1[1-9]_' } | Sort-Object Name)) {
            $nombreT = ($f.BaseName -replace "^\d+_", "") + ".csv"
            $rutaT = Join-Path $carpetaT $nombreT
            $iniT = Get-Date
            $cmdT = $cnT.CreateCommand()
            $cmdT.CommandText = [System.IO.File]::ReadAllText($f.FullName)
            $cmdT.CommandTimeout = 1800
            $rT = $cmdT.ExecuteReader()
            $wT = New-Object System.IO.StreamWriter($rutaT, $false, $utf8)
            $wT.NewLine = "`n"
            $colsT = @(); for ($i = 0; $i -lt $rT.FieldCount; $i++) { $colsT += $rT.GetName($i) }
            $wT.WriteLine(($colsT -join ";"))
            $filasT = 0
            $valsT = New-Object object[] $rT.FieldCount
            while ($rT.Read()) {
                [void]$rT.GetValues($valsT)
                $lineaT = New-Object string[] $rT.FieldCount
                for ($i = 0; $i -lt $rT.FieldCount; $i++) { $lineaT[$i] = Formatear $valsT[$i] }
                $wT.WriteLine(($lineaT -join ";"))
                $filasT++
            }
            $wT.Close(); $rT.Close()
            $segT = [int]((Get-Date) - $iniT).TotalSeconds
            Log ("tableros\{0,-22} {1,9} filas  {2,4} s" -f $nombreT, $filasT, $segT)
            $ctlT.Add(($nombreT, $filasT) -join ";")
        }
        $cnT.Close()
        $cwT = New-Object System.IO.StreamWriter((Join-Path $carpetaT "_control_tableros.csv"), $false, $utf8)
        $cwT.NewLine = "`n"
        $cwT.WriteLine("archivo;filas;fecha_datos")
        foreach ($l in $ctlT) { $cwT.WriteLine(($l, $FechaDatos) -join ";") }
        $cwT.Close()
        Log "Tableros: listo en $carpetaT"
        Get-ChildItem -Path $Salida -Directory -Filter "tableros_*" | Sort-Object Name -Descending | Select-Object -Skip 7 | Remove-Item -Recurse -Force
    } catch {
        Log "TABLEROS: ERROR $_  (la exportacion de Bacarnet NO se vio afectada)"
        try { Set-Content -Path (Join-Path $carpetaT "_ERROR.txt") -Value ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_) -Encoding UTF8 } catch { }
    }
}

if ($CarpetaDrive -ne "") {
    $dest = Join-Path $CarpetaDrive ("vientri_" + $sello)
    Copy-Item -Path $carpeta -Destination $dest -Recurse -Force
    Log "Copiado a Drive: $dest"
}
