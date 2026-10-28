$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('caij-visibility-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    foreach ($scriptName in @('AtualizarCAIJ.ps1', 'AtualizarPendrives.ps1')) {
        $AppRoot = $testRoot
        foreach ($name in @('InfoNotebook.bat', 'InfoNotebook.vbs', 'InfoNotebook.lnk')) {
            $path = Join-Path $AppRoot $name
            if (Test-Path -LiteralPath $path) { (Get-Item -LiteralPath $path -Force).Attributes = [IO.FileAttributes]::Normal }
            [IO.File]::WriteAllText($path, 'fixture')
            (Get-Item -LiteralPath $path -Force).Attributes = [IO.FileAttributes]::Hidden
        }
        $tokens = $null; $errors = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $scriptName), [ref]$tokens, [ref]$errors)
        if ($errors.Count) { throw 'Script invalido.' }
        $fn = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-CaijLauncherVisibility' }, $true)
        Invoke-Expression $fn.Extent.Text
        Set-CaijLauncherVisibility -AppRoot $AppRoot
        $bat = Get-Item -LiteralPath (Join-Path $AppRoot 'InfoNotebook.bat') -Force
        if ($bat.Attributes -band [IO.FileAttributes]::Hidden) { throw "FAIL: $scriptName esconde InfoNotebook.bat" }
        $vbs = Get-Item -LiteralPath (Join-Path $AppRoot 'InfoNotebook.vbs') -Force
        if (-not ($vbs.Attributes -band [IO.FileAttributes]::Hidden)) { throw 'VBS deve continuar oculto.' }
    }
    'OK: ambos atualizadores mantem o BAT visivel.'
} finally {
    foreach ($name in @('InfoNotebook.bat', 'InfoNotebook.vbs', 'InfoNotebook.lnk')) {
        $path = Join-Path $testRoot $name
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    Remove-Item -LiteralPath $testRoot
}
