<#
  Exporta los CSV de Vientri para Bacarnet Finanzas (contrato de datos v0.2).
  Solo LEE la copia de SGA_BACAR adjunta en LocalDB. Nunca se conecta a VIENTRISRV ni escribe en Vientri.

  Uso (PowerShell en SIS5):
    .\exportar_vientri.ps1 -ListarBases
    .\exportar_vientri.ps1 -Base SGA_BACAR -FechaDatos "2026-10-15T10:04:00"
    .\exportar_vientri.ps1 -Base SGA_BACAR -Desde "2026-10-14T00:00:00"     (incremental)

  Formato: separador ;  UTF-8 sin BOM, con encabezado, fin de linea \n,
  fechas AAAA-MM-DD, fecha-hora AAAA-MM-DDTHH:MM:SS, decimales con punto, booleanos 0/1, nulo = vacio.
  Los archivos tienen datos personales (CUIT, nombres, importes): guardarlos solo en carpetas restringidas.
#>
param(
    [string]$Servidor = "(localdb)\MSSQLLocalDB",
    [string]$Base = "SGA_BACAR",
    [string]$Salida = "D:\inventario_vientri\exportaciones",
    [string]$Desde = "",
    [string]$FechaDatos = "",
    [string]$CarpetaDrive = "",
    [switch]$ListarBases
)

$ErrorActionPreference = "Stop"
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$utf8 = New-Object System.Text.UTF8Encoding($false)
$versionContrato = "0.2"

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

foreach ($f in (Get-ChildItem -Path $sqlDir -Filter "*.sql" | Sort-Object Name)) {
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

if ($CarpetaDrive -ne "") {
    $dest = Join-Path $CarpetaDrive ("vientri_" + $sello)
    Copy-Item -Path $carpeta -Destination $dest -Recurse -Force
    Log "Copiado a Drive: $dest"
}
