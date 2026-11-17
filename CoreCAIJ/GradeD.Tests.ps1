$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'GradeRules.ps1')
$server = Join-Path $PSScriptRoot 'ServidorImpressao.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($server, [ref]$null, [ref]$null)
foreach ($name in @('Assert-CaijGradeDetail', 'Merge-CaijGradeDetail', 'New-VhsysOrdemServico')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $definition) { throw "Funcao ausente: $name" }
    Invoke-Expression $definition.Extent.Text
}
function Test-TecnicoCadastroValido { return $true }
function Read-AltertagApiConfig { throw 'ERRO: configuracao/API nao deve ser acessada para D sem detalhe' }
foreach ($detail in @('', ' ', "`t`r`n")) {
    $blocked = $false
    try { New-VhsysOrdemServico -Tecnico 'Vitor' -Serial 'QA-D-001' -Referencia 'GRADE D' -IdProduto 1 -ProdutoDescricao 'Fixture' -Observacao 'Servicos: Testes aprovados' -DetalheGrade $detail | Out-Null }
    catch [System.ArgumentException] { $blocked = $true }
    if (-not $blocked) { throw 'Cadastro D vazio passou do guard antes de carregar configuracao/API' }
}
foreach ($grade in @('D', 'GRADE D', ' grade d ')) {
    foreach ($detail in @('', ' ', "`t`r`n")) {
        $blocked = $false
        try { Merge-CaijGradeDetail -Grade $grade -Observacao 'Servicos: Testes aprovados' -DetalheGrade $detail | Out-Null }
        catch [System.ArgumentException] { $blocked = $true }
        if (-not $blocked) { throw "Grade D sem detalhe livre aceita: [$grade] [$detail]" }
    }
    $merged = Merge-CaijGradeDetail -Grade $grade -Observacao 'Servicos: Testes aprovados' -DetalheGrade 'Risco profundo na tampa'
    if ($merged -notmatch 'Risco profundo na tampa') { throw 'Detalhe D perdeu-se antes de etiqueta/cadastro' }
    $again = Merge-CaijGradeDetail -Grade $grade -Observacao $merged -DetalheGrade 'Risco profundo na tampa'
    if ($again -cne $merged) { throw 'Detalhe D duplicado ao preparar payload novamente' }
}
foreach ($grade in @('A', 'B', 'C', 'RMA', 'T - TRIAGEM')) {
    if ((Merge-CaijGradeDetail -Grade $grade -Observacao 'Texto preservado' -DetalheGrade '') -cne 'Texto preservado') { throw "Regressao outra grade: $grade" }
}
'OK: Grade D no servidor exige detalhe livre e preserva observacao sem duplicacao (sem rede/impressao).'
