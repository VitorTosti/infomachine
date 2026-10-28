$ErrorActionPreference = 'Stop'
$text = Get-Content (Join-Path $PSScriptRoot 'ServidorImpressao.ps1') -Raw
$ast = [Management.Automation.Language.Parser]::ParseInput($text, [ref]$null, [ref]$null)
$fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Publish-QrFicha' }, $true)
Invoke-Expression $fn.Extent.Text
$env:CAIJ_LABEL_API_KEY = 'test-only'
$env:CAIJ_LABEL_API_URL = ''
$env:CAIJ_LABEL_PUBLIC_URL = ''
$caijServerDataRoot = $PSScriptRoot
$script:calls = 0
function Invoke-RestMethod {
    param($Method, $Uri, $Headers, $ContentType, $Body, $TimeoutSec)
    $script:calls++
    $script:uri = $Uri
    if ($script:fail) { throw 'timeout simulado' }
    return @{ url = 'https://infocaij.com.br/f/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
}
$result = Publish-QrFicha -Ficha @{ tipo='NOTEBOOK' }
if ($script:uri -ne 'http://127.0.0.1:4177/api/label-sheets') { throw "Publicacao deveria usar backend local, recebeu $script:uri" }
if ($result -ne 'https://infocaij.com.br/f/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') { throw 'QR deve preservar URL publica' }
$script:fail = $true
$script:calls = 0
try { Publish-QrFicha -Ficha @{}; throw 'Falha esperada' } catch { if ($_ -notmatch 'timeout simulado') { throw } }
if ($script:calls -ne 1) { throw 'Publicacao nao deve ser repetida apos timeout' }
Write-Host 'OK: publicacao local, URL publica e envio unico'
