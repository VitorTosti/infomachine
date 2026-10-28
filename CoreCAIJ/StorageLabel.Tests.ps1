$ErrorActionPreference = 'Stop'
$server = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ServidorImpressao.ps1') -Raw
$ast = [Management.Automation.Language.Parser]::ParseInput($server, [ref]$null, [ref]$null)
foreach ($name in @('Limpar', 'Short-Disco', 'Fit-TsplText', 'Get-DiskLabelLines')) {
    $function = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true) | Select-Object -Last 1
    if (-not $function) { throw "Funcao $name nao encontrada" }
    Invoke-Expression $function.Extent.Text
}
if ((Short-Disco '320GB HDD') -ne '320GB HDD') { throw 'HD de 320 GB foi alterado' }
if ((Short-Disco '1TB HDD') -ne '1TB HDD') { throw 'HD de 1 TB virou SSD' }
if ((Short-Disco '256GB SSD + 500GB HDD') -ne '256GB SSD + 500GB HDD') { throw 'Segundo disco foi perdido' }
$lines = @(Get-DiskLabelLines '256GB SSD + 500GB HDD')
if ($lines.Count -lt 1 -or (($lines -join ' ') -notmatch '256GB SSD.*500GB HDD')) { throw 'Etiqueta nao mostra ambos os discos' }
$three = @(Get-DiskLabelLines '256GB SSD + 500GB HDD + 1TB SSD')
if (($three -join ' ') -notmatch '1TB SSD') { throw 'Terceiro disco nao aparece na etiqueta' }
'PASS: servidor preserva HD, SSD e os dois discos na etiqueta.'
