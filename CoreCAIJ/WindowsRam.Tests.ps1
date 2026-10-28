$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'InfoNotebookWindowsPreview.ps1'
. (Join-Path $PSScriptRoot 'WindowsStorage.ps1')
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
foreach ($name in @('ConvertTo-MarketedMemory', 'Get-WindowsRamSummary')) {
    $functionAst = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true)
    if (-not $functionAst) { throw "Funcao ausente: $name" }
    Invoke-Expression $functionAst.Extent.Text
}

function Assert-Ram {
    param([object[]]$Modules, [object[]]$Arrays, [string]$ExpectedRam, [string[]]$Details)
    $result = Get-WindowsRamSummary -Modules $Modules -Arrays $Arrays
    if ($result.ram -ne $ExpectedRam) { throw "RAM inesperada: $($result.ram), esperado $ExpectedRam" }
    foreach ($detail in $Details) {
        if (-not $result.ramDetalhes.Contains($detail)) { throw "Detalhe ausente: $detail em $($result.ramDetalhes)" }
    }
}

$slot2 = @([pscustomobject]@{ Use=3; MemoryDevices=2 })
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=24; MemoryType=0; FormFactor=12 }) -Arrays $slot2 -ExpectedRam '8GB DDR3' -Details @('Instalado: 1 × 8GB DDR3', 'Posições da BIOS: 1 de 2 ocupadas; 1 livre informada')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=16GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12 }) -Arrays $slot2 -ExpectedRam '16GB DDR4' -Details @('Instalado: 1 × 16GB DDR4', 'Posições da BIOS: 1 de 2 ocupadas; 1 livre informada')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12; ConfiguredClockSpeed=3200; Speed=3200 }, [pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12; ConfiguredClockSpeed=3200; Speed=3200 }) -Arrays $slot2 -ExpectedRam '16GB DDR4' -Details @('Instalado: 2 × 8GB DDR4 3200 MHz', 'Posições da BIOS: 2 de 2 ocupadas; 0 livres informadas')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=16GB; SMBIOSMemoryType=34; MemoryType=0; FormFactor=12; Speed=4800 }, [pscustomobject]@{ Capacity=16GB; SMBIOSMemoryType=34; MemoryType=0; FormFactor=12; Speed=4800 }) -Arrays $slot2 -ExpectedRam '32GB DDR5' -Details @('Instalado: 2 × 16GB DDR5 4800 MHz', 'Posições da BIOS: 2 de 2 ocupadas; 0 livres informadas')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=35; MemoryType=0; FormFactor=14 }) -Arrays @() -ExpectedRam '8GB LPDDR5' -Details @('Instalado: 1 × 8GB LPDDR5', 'RAM soldada: indício')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=0; MemoryType=0; FormFactor=0 }) -Arrays @([pscustomobject]@{ Use=3; MemoryDevices=0 }) -ExpectedRam '8GB' -Details @('Instalado: 1 × 8GB', 'Tipo DDR: não informado', 'Posições livres: BIOS não confirmou')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12 }, [pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12 }) -Arrays @([pscustomobject]@{ Use=3; MemoryDevices=1 }) -ExpectedRam '16GB DDR4' -Details @('Instalado: 2 × 8GB DDR4', 'Posições livres: BIOS não confirmou')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12 }, [pscustomobject]@{ Capacity=16GB; SMBIOSMemoryType=26; MemoryType=0; FormFactor=12 }) -Arrays $slot2 -ExpectedRam '24GB DDR4' -Details @('Instalado: 1 × 8GB DDR4 + 1 × 16GB DDR4')
Assert-Ram -Modules @([pscustomobject]@{ Capacity=8GB; SMBIOSMemoryType='Unknown'; MemoryType='Unknown'; FormFactor='Unknown'; ConfiguredClockSpeed='Unknown'; Speed='Unknown' }) -Arrays @([pscustomobject]@{ Use=3; MemoryDevices='Unknown' }) -ExpectedRam '8GB' -Details @('Instalado: 1 × 8GB', 'Posições livres: BIOS não confirmou')

$previewSource = Get-Content -LiteralPath $path -Raw -Encoding UTF8
if (-not $previewSource.Contains('Get-Content -LiteralPath $deviceOutputPath -Raw -Encoding UTF8 | ConvertFrom-Json')) {
    throw 'O processo principal precisa ler o diagnóstico UTF-8 gerado pelo processo de leitura.'
}
$temp = Join-Path ([IO.Path]::GetTempPath()) ('caij-ram-utf8-' + [guid]::NewGuid().ToString('N') + '.json')
try {
    [IO.File]::WriteAllText($temp, '{"ramDetalhes":"1 módulo de memória; RAM soldada: não identificável"}', (New-Object Text.UTF8Encoding($false)))
    $roundTrip = Get-Content -LiteralPath $temp -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($roundTrip.ramDetalhes -ne '1 módulo de memória; RAM soldada: não identificável') {
        throw 'O texto de RAM perdeu acentos na leitura do arquivo de diagnóstico.'
    }
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
}

'OK: Windows RAM tests'
