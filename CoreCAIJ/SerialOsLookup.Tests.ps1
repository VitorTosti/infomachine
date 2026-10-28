param([string]$ScriptPath = (Join-Path $PSScriptRoot 'ServidorImpressao.ps1'))

$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw $parseErrors[0] }
$functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Find-VhsysOrdensBySerial' }, $true)
if (-not $functionAst) { throw 'FAIL: busca de OS por serial nao implementada' }
Invoke-Expression $functionAst.Extent.Text

function Read-AltertagApiConfig { return @{ ApiBaseUrl='https://example.invalid/api/v2'; AccessToken='x'; SecretAccessToken='y' } }
function New-AltertagApiHeaders { return @{} }
function Assert-VhsysSuccess { param($Response, $Contexto) return $Response }
function Invoke-RestMethod {
    param($Uri, $Method, $Headers, $TimeoutSec, $ErrorAction)
    $script:visitedUris += $Uri
    return @{ data=$script:firstPage; paging=@{ total=$script:total } }
}
function Invoke-VhsysGetBatch {
    param($Uris, $Headers, $TimeoutSec, $Concurrency)
    $script:visitedUris += @($Uris)
    return ,@([pscustomobject]@{ Uri=$Uris[0]; Response=@{ data=$script:nextPage }; Error='' })
}
function ConvertFrom-VhsysOrdensServico {
    param($Response)
    return @($Response.data | ForEach-Object { [pscustomobject]@{ numero=$_.numero; osCodigo=$_.osCodigo; garantia=$_.garantia_ordem } })
}

$script:visitedUris = @()
$script:firstPage = @(
    [pscustomobject]@{ numero=1164; osCodigo='C001164'; garantia_ordem='7NKF1G3'; idOrdem=1; statusOs='Em Aberto' },
    [pscustomobject]@{ numero=1165; osCodigo='C001165'; garantia_ordem='OUTRA'; idOrdem=2; statusOs='Em Aberto' }
)
$script:total = 2
$script:nextPage = @()
$single = @(Find-VhsysOrdensBySerial -Serial ' 7nkf-1g3 ')
if ($single.Count -ne 1 -or $single[0].osCodigo -ne 'C001164') { throw 'FAIL: serial normalizada nao localizou a OS exata' }
if ($script:visitedUris.Count -ne 1) { throw 'FAIL: pagina curta deveria encerrar a busca' }

$script:firstPage = @($script:firstPage[0]) + @(1..249 | ForEach-Object { [pscustomobject]@{ numero=(2000+$_); osCodigo=('C{0:D6}' -f (2000+$_)); garantia_ordem='OUTRA'; idOrdem=(2000+$_); statusOs='Concluido' } })
$script:nextPage = @([pscustomobject]@{ numero=2200; osCodigo='C002200'; garantia_ordem='7NKF1G3'; idOrdem=2200; statusOs='Concluido' })
$script:total = 251
$script:visitedUris = @()
$multiple = @(Find-VhsysOrdensBySerial -Serial '7NKF1G3')
if ($multiple.Count -ne 2) { throw "FAIL: OS duplicadas devem ser apresentadas; atual=$($multiple.Count)" }
if ($multiple[0].osCodigo -ne 'C002200' -or $multiple[1].osCodigo -ne 'C001164') { throw 'FAIL: OS devem vir da mais recente para a mais antiga' }
if ($script:visitedUris.Count -ne 2) { throw 'FAIL: deve consultar a pagina seguinte para procurar outras OS' }

$none = @(Find-VhsysOrdensBySerial -Serial 'SEM-MATCH')
if ($none.Count -ne 0) { throw 'FAIL: serial sem OS deve retornar lista vazia' }
$script:nextPage = @()
$incompleteRejected = $false
try { @(Find-VhsysOrdensBySerial -Serial 'SERIAL-NOVA') | Out-Null }
catch { $incompleteRejected = $_.Exception.Message -match 'mudou durante a consulta' }
if (-not $incompleteRejected) { throw 'FAIL: pagina ausente nao pode afirmar que a serial e nova' }
$cpuAst = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Short-Cpu' }, $true)
if (-not $cpuAst) { throw 'FAIL: formatador de CPU da etiqueta ausente' }
function Limpar { param($s, $extra='') return [string]$s }
Invoke-Expression $cpuAst.Extent.Text
if ((Short-Cpu '12th Gen Intel(R) Core(TM) i5-1235U CPU @ 1.30GHz') -ne 'i5-1235U') { throw 'FAIL: etiqueta deve conservar modelo completo do i5' }
if ((Short-Cpu 'Intel(R) Core(TM) i7-1165G7') -ne 'i7-1165G7') { throw 'FAIL: etiqueta deve conservar sufixo do i7' }
Write-Host 'PASS: busca por serial encontra uma, varias ou nenhuma OS sem confundir seriais.'
