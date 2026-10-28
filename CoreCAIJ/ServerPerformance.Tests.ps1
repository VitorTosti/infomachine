$ErrorActionPreference = 'Stop'
$script:caijServerSourcePath = Join-Path $PSScriptRoot 'ServidorImpressao.ps1'
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($script:caijServerSourcePath, [ref]$null, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('New-CaijRequestPool','Test-VhsysOrdemServicoLocalizacao','Confirm-VhsysOrdemServicoLocalizacao')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    Invoke-Expression $definition.Extent.Text
}
$almoxarifadoBancadaTecnicaId = 31196
$tecnicosPermitidos = @('VITOR')
$desktopUsuario = Split-Path -Parent $PSScriptRoot
$script:queries = 0
function Invoke-VhsysJson { $script:queries++; return [pscustomobject]@{ data=[pscustomobject]@{ id_almoxarifado=31196 } } }
$confirmed = [pscustomobject]@{ data=[pscustomobject]@{ id_almoxarifado=31196 } }
if (-not (Confirm-VhsysOrdemServicoLocalizacao -Config @{} -IdOrdem 1 -IdPedido 1 -OsPayload @{} -InitialResponse $confirmed)) { throw 'Location was not confirmed.' }
if ($queries -ne 0) { throw 'Confirmed POST response should not cause another GET.' }
if (-not (Confirm-VhsysOrdemServicoLocalizacao -Config @{} -IdOrdem 1 -IdPedido 1 -OsPayload @{} -InitialResponse ([pscustomobject]@{ data=@{} }))) { throw 'Missing location must use existing verification.' }
if ($queries -ne 1) { throw 'Missing location skipped the mandatory verification.' }

$readPool = New-CaijRequestPool -Workers 2
$mutationPool = New-CaijRequestPool -Workers 1
$long = [powershell]::Create(); $short = [powershell]::Create()
try {
    $long.RunspacePool = $mutationPool
    [void]$long.AddScript('Start-Sleep -Milliseconds 800; "mutation completed"')
    $handle = $long.BeginInvoke()
    $short.RunspacePool = $readPool
    [void]$short.AddScript('Test-TecnicoCadastroValido -Tecnico VITOR; Get-CaijMacUiDirectory')
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $result = $short.Invoke()
    if ($short.HadErrors) { throw ($short.Streams.Error | Out-String) }
    if ($result[0] -ne $true -or -not $result[1]) { throw 'Worker configuration or function imports were lost.' }
    if ($handle.IsCompleted) { throw 'Read was blocked by the long operation.' }
    Write-Host "Concurrent read during simulated 800ms mutation: $($clock.ElapsedMilliseconds)ms"
    $long.EndInvoke($handle) | Out-Null
} finally {
    $long.Dispose(); $short.Dispose()
    $readPool.Close(); $readPool.Dispose(); $mutationPool.Close(); $mutationPool.Dispose()
}
Write-Host 'Server isolation and location confirmation tests passed (no real OS or printing).'
