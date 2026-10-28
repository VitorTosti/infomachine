$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$launcher = Get-Content -LiteralPath (Join-Path $root 'TestarInterfaceWindows.bat') -Raw -Encoding UTF8
$preview = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'InfoNotebookWindowsPreview.ps1') -Raw -Encoding UTF8
$html = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'mac-ui\index.html') -Raw -Encoding UTF8
$app = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'mac-ui\app.js') -Raw -Encoding UTF8
$style = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'mac-ui\style.css') -Raw -Encoding UTF8
$portable = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'mac-ui\portable.js') -Raw -Encoding UTF8

$previewAst = [System.Management.Automation.Language.Parser]::ParseInput($preview, [ref]$null, [ref]$null)
$modelFunctionAst = $previewAst.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-PreferredWindowsModelName'
}, $true)
if (-not $modelFunctionAst) { throw 'Funcao de selecao do modelo Windows nao encontrada.' }
Invoke-Expression $modelFunctionAst.Extent.Text
$dellModel = Get-PreferredWindowsModelName -Manufacturer 'Dell Inc.' -Candidates @('Latitude 5320', 'Latitude', 'Latitude 5320', 'Latitude')
if ($dellModel -ne 'Dell Latitude 5320') { throw "Modelo Dell incompleto: $dellModel" }

$checks = @(
    @($launcher, 'InfoNotebookWindowsPreview.ps1'),
    @($preview, "platform = 'windows'"),
    @($preview, "'--inprivate'"),
    @($preview, "'--start-fullscreen'"),
    @($preview, '--user-data-dir='),
    @($preview, '--auto-accept-camera-and-microphone-capture'),
    @($preview, 'Send-LocalUiFile'),
    @($preview, "'/observation.js' = @('observation.js', 'text/javascript; charset=utf-8')"),
    @($preview, 'function Test-LocalClientDisconnect'),
    @($preview, 'http://127.0.0.1:$localBridgePort/'),
    @($preview, 'Win32_ComputerSystemProduct'),
    @($preview, 'SystemProductName'),
    @($preview, 'function Get-WindowsBatterySummary'),
    @($preview, 'powercfg.exe'),
    @($preview, '/batteryreport /output $reportPath /xml'),
    @($html, 'id="platformName"'),
    @($html, '<link rel="icon" type="image/svg+xml" href="app-icon.svg">'),
    @($preview, "'/app-icon.svg' = @('app-icon.svg', 'image/svg+xml')"),
    @($app, 'isWindowsPreview'),
    @($app, 'Central de testes Windows'),
    @($app, 'windows-function-row'),
    @($app, 'windows-navigation-keys'),
    @($app, 'windows-numpad'),
    @($app, 'NumpadEnter: "NUMENTER"'),
    @($app, 'Privacidade e segurança > Câmera ou Microfone'),
    @($app, 'normalizeStorage'),
    @($app, 'refreshOsVerification'),
    @($app, 'scheduleOsIdentification'),
    @($app, 'addEventListener("input", scheduleOsIdentification)'),
    @($app, 'qs("createCurrentOs").addEventListener("input", scheduleOsIdentification)'),
    @($html, 'id="currentConfigCard"'),
    @($html, 'id="read3uTools"'),
    @($html, 'id="osVerification"'),
    @($html, 'class="hero-command-bar"'),
    @($html, 'id="openMenu"'),
    @($html, 'id="openLabels"'),
    @($html, 'id="homeView"'),
    @($html, 'id="labelsView"'),
    @($html, 'id="testsView"'),
    @($html, 'id="createOsView"'),
    @($html, 'id="createCurrentOs"'),
    @($html, 'aria-label="Alterar rastreador atual"'),
    @($html, 'class="thermal-label"'),
    @($html, 'id="labelPreviewModel"'),
    @($html, 'id="printOsInput"'),
    @($html, 'id="toggleLabelEditor"'),
    @($html, 'id="labelEditForm"'),
    @($html, 'aria-current="page"'),
    @($html, 'class="os-box hero-os home-os-band"'),
    @($html, 'class="brand-copy"'),
    @($html, 'class="equipment-summary"'),
    @($html, '<span>Rastreador</span>'),
    @($html, 'aria-label="Número do rastreador"'),
    @($html, 'id="workflowTitle"'),
    @($html, 'id="refreshReading"'),
    @($html, 'id="copyDeviceInfo"'),
    @($html, 'id="sessionClock"'),
    @($html, 'id="workflowOverall"'),
    @($html, 'id="nextActionButton"'),
    @($html, 'id="operationalAlerts"'),
    @($html, 'id="reviewSerialDivergence"'),
    @($html, 'id="lastPrintValue"'),
    @($html, 'id="reprintLast"'),
    @($html, 'id="printHistoryList"'),
    @($html, 'id="printHistoryEmpty"'),
    @($html, 'id="printHistoryCount"'),
    @($html, 'id="printHistoryPanel"'),
    @($html, 'class="workflow-marker"'),
    @($app, 'function renderOperationalDashboard()'),
    @($app, 'function renderPrintHistory()'),
    @($app, 'function setButtonBusy(button, busy'),
    @($app, 'function runWorkflowAction(action)'),
    @($app, 'function refreshDeviceReading()'),
    @($app, 'function copyDeviceInfo()'),
    @($app, 'function updateSessionClock()'),
    @($app, 'function syncCompletedTestsToRecord(pending)'),
    @($html, 'id="finishTests"'),
    @($html, 'id="testsCompletion"'),
    @($html, 'class="tests-overview" aria-label="Resumo dos testes"'),
    @($html, 'class="test-list-head"'),
    @($app, 'caij:last-print'),
    @($app, 'caij:print-history'),
    @($portable, 'automaticObservation'),
    @($portable, '/api/os-detail'),
    @($portable, '/api/read-3utools'),
    @($portable, 'manualOsSet'),
    @($portable, '!portableState.manualOsSet'),
    @($preview, 'Get-Windows3uToolsInfo'),
    @($preview, "-Arguments '-k SerialNumber'"),
    @($preview, 'BaseName -ieq "${currentSerial}_info"'),
    @($preview, 'ainda não foi atualizado no 3uTools'),
    @($preview, 'localBridgeUrl'),
    @($portable, 'equipmentType'),
    @($app, 'function showAppView(view)'),
    @($app, 'function populateLabelEditor()'),
    @($app, 'function updatePrintOsAvailability()'),
    @($app, 'function labelContextFromCreate(body)'),
    @($app, 'function import3uToolsDevice(button)'),
    @($app, 'awaitingDeviceImport'),
    @($app, 'const hadImportedDevice = Boolean(state.device3u)'),
    @($app, 'state.device3u = null'),
    @($app, 'function inferEquipmentType(product'),
    @($html, 'id="printCreatedOs"'),
    @($html, 'name="monitorTamanho"'),
    @($html, 'name="monitorEntradas"'),
    @($html, 'id="labelEquipmentType"'),
    @($html, 'id="read3uToolsLabel"'),
    @($html, 'name="imei"'),
    @($html, 'name="ciclos"'),
    @($portable, 'monitorTamanho: info.monitorTamanho'),
    @($portable, 'monitorEntradas: info.monitorEntradas'),
    @($portable, 'celularImei: info.imei'),
    @($portable, 'celularCiclos: info.ciclos'),
    @($style, '.label-workspace'),
    @($style, 'aspect-ratio: 8 / 5'),
    @($style, '--accent-cyan: #55c8ff'),
    @($style, '--accent-mint: #4cdda2'),
    @($style, '.workflow-step:nth-child(3)'),
    @($style, '.grade-fieldset .grade[data-grade="RMA"].active'),
    @($style, 'button.is-busy::before'),
    @($style, '@keyframes action-spin')
)

if (-not ($app -match 'functionKeys[\s\S]*PRINTSCREEN[\s\S]*SCROLLLOCK[\s\S]*PAUSE') -or
    -not ($app -match 'navigationKeys[\s\S]*INSERT[\s\S]*PAGEDOWN[\s\S]*ARROWLEFT') -or
    -not ($app -match 'numpadKeys[\s\S]*NUMLOCK[\s\S]*NUMENTER[\s\S]*NUM0')) {
    throw 'O teclado Windows deve reproduzir os blocos principal, navegacao e numerico da referencia.'
}
if (-not ($style -match '\.windows-keyboard-grid[\s\S]*grid-template-columns:\s*var\(--main-width\) var\(--key\) var\(--numpad-width\)') -or
    -not ($style -match '\.keyboard-map\.windows-keyboard kbd\.pressed[\s\S]*background:\s*#fff')) {
    throw 'O teclado Windows deve manter proporcoes fisicas e destacar as teclas confirmadas.'
}

if ($html.Contains('id="printHero"')) {
    throw 'O topo nao deve repetir o botao de imprimir etiqueta.'
}
if (-not ($preview -match 'Test-LocalClientDisconnect[\s\S]*System\.IO\.IOException[\s\S]*System\.Net\.Sockets\.SocketException[\s\S]*System\.ObjectDisposedException')) {
    throw 'O servidor local deve reconhecer desconexoes normais do navegador.'
}
if (-not ($preview -match 'Send-LocalBytesResponse[\s\S]*catch\s*\{[\s\S]*Test-LocalClientDisconnect[\s\S]*while \(-not \$edgeProcess\.HasExited\)[\s\S]*catch\s*\{[\s\S]*Test-LocalClientDisconnect')) {
    throw 'Uma conexao cancelada pelo Edge nao deve encerrar a interface local.'
}
if ($html -match 'id="testsDialog"|id="createOsDialog"') {
    throw 'Testes e Cadastrar OS devem ser paginas, nao pop-ups.'
}
if (-not ($app -match 'home:\s*"homeView"[\s\S]*labels:\s*"labelsView"[\s\S]*tests:\s*"testsView"[\s\S]*createOs:\s*"createOsView"')) {
    throw 'A navegacao principal deve controlar as quatro paginas internas.'
}
if (-not ($html -match 'create-os-head-actions[\s\S]*RASTREADOR ATUAL[\s\S]*id="createCurrentOs"')) {
    throw 'A pagina Cadastrar OS deve destacar a OS atual no cabecalho.'
}
if (-not ($app -match 'osNumberFromInput\(\)[\s\S]*createCurrentOs[\s\S]*showAppView\("createOs"\)')) {
    throw 'A OS atual deve ser sincronizada ao abrir a pagina Cadastrar OS.'
}
if ($html.Contains('id="heroModel"') -or $app.Contains('qs("heroModel")')) {
    throw 'O topo nao deve repetir o modelo exibido nas informacoes da maquina.'
}
if ($html -match 'Adicionar a observa') {
    throw 'Os testes concluidos devem atualizar as observacoes automaticamente.'
}
if (-not ($html -match 'id="workflowRead"[\s\S]*id="workflowTests"[\s\S]*id="workflowOs"[\s\S]*id="workflowLabel"')) {
    throw 'O Menu deve resumir leitura, testes, OS e etiqueta na ordem operacional.'
}
if (-not ($app -match 'internetOnline[\s\S]*serverOnline[\s\S]*hasSerialDivergence')) {
    throw 'O Menu deve concentrar somente alertas operacionais relevantes.'
}
if (-not ($html -match '<section class="topbar">[\s\S]*?class="hero-command-bar"')) {
    throw 'A navegacao deve ficar dentro da barra superior.'
}
if (-not ($style -match '\.topbar\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?z-index:\s*100;')) {
    throw 'A navegacao superior deve permanecer visivel durante a rolagem.'
}
if (-not ($style -match '\.topbar,\s*\.windows-preview \.topbar\s*\{[\s\S]*?background:\s*#0d111b;')) {
    throw 'A barra superior deve usar uma unica superficie solida, sem divergencia no fundo.'
}
if (-not ($style -match '\.home-workspace\s*\{\s*align-items:\s*start;\s*\}')) {
    throw 'Os paineis do Menu nao devem ser esticados e criar espaco vazio.'
}
if (-not ($html -match 'class="home-device-column"[\s\S]*?class="panel device-panel"[\s\S]*?class="os-box hero-os home-os-band"')) {
    throw 'A OS selecionada deve ficar logo abaixo dos dados do equipamento no Menu.'
}
if ($html -match 'hero-action-index|hero-action-copy') {
    throw 'A navegacao superior deve usar somente rotulos curtos.'
}
if (-not ($html -match 'id="openMenu"[\s\S]*?<svg[\s\S]*?<span>Menu</span>') -or
    -not ($html -match 'id="openLabels"[\s\S]*?<svg[\s\S]*?<span>Etiquetas</span>') -or
    -not ($html -match 'id="openTests"[\s\S]*?<svg[\s\S]*?<span>Testes</span>') -or
    -not ($html -match 'id="openCreateOs"[\s\S]*?<svg[\s\S]*?<span>Cadastrar rastreador</span>')) {
    throw 'A navegacao principal deve combinar icones discretos com rotulos curtos.'
}
if (-not ($style.Contains('Identidade premium CAIJ')) -or
    -not ($style.Contains('font-feature-settings: "calt", "kern", "liga", "ss03"')) -or
    -not ($style.Contains('.app-view:not(.hidden) { animation: caij-view-enter'))) {
    throw 'A interface deve aplicar a camada visual premium, tipografia refinada e transicao de pagina.'
}
if (-not ($html -match 'class="create-flow-rail"[\s\S]*Técnico[\s\S]*Produto[\s\S]*Dados[\s\S]*Criar rastreador') -or
    -not ($html -match 'class="create-os-heading-icon"[\s\S]*id="createOsTitle"') -or
    -not ($style.Contains('.create-os-page .create-os-actions')) -or
    -not ($style -match '\.create-os-page \.create-os-actions\s*\{[\s\S]*?position:\s*sticky;')) {
    throw 'O cadastro de OS deve apresentar as quatro etapas, cabecalho visual e acao final sempre acessivel.'
}
$homeIndex = $html.IndexOf('id="homeView"')
$labelsIndex = $html.IndexOf('id="labelsView"')
$printIndex = $html.IndexOf('class="panel print-panel"')
if ($homeIndex -lt 0 -or $labelsIndex -le $homeIndex -or $printIndex -le $labelsIndex) {
    throw 'A impressao deve ficar somente na pagina Etiquetas, depois da pagina inicial.'
}
$printButtonIndex = $html.IndexOf('id="printBtn"', $printIndex)
$verificationIndex = $html.IndexOf('id="osVerification"', $labelsIndex)
$labelToolbarIndex = $html.IndexOf('class="label-edit-toolbar"', $printIndex)
if ($printButtonIndex -le $printIndex -or $verificationIndex -le $labelsIndex -or
    $verificationIndex -ge $printIndex -or $labelToolbarIndex -le $printButtonIndex -or
    -not ($html -match 'class="print-command-bar"[\s\S]*id="syncOs"[\s\S]*id="printBtn"')) {
    throw 'A area de preparo deve manter conferencia, campos e impressao na aba Etiquetas.'
}
if (-not ($html.Contains('class="thermal-identification"') -and
    $html.Contains('class="label-preview-support"') -and
    $style.Contains('.labels-view .thermal-identification') -and
    $style.Contains('.labels-view .label-preview-support') -and
    $style.Contains('@media (max-width: 1380px)'))) {
    throw 'A pagina Etiquetas deve alinhar a previa fisica, usar o espaco inferior e adaptar as colunas.'
}
if (-not ($app.Contains('window.scrollTo({ top: 0, behavior: "smooth" })'))) {
    throw 'A aba Menu deve retornar para a pagina principal.'
}
if (-not ($html -match 'id="statusLine" hidden')) {
    throw 'A linha de status nao deve ficar visivel na interface principal.'
}
if (-not ($html -match 'id="skipActiveTest"[\s\S]*id="failAndNextTest"[\s\S]*id="passAndNextTest"[\s\S]*id="activeTestBody"') -or
    -not ($app -match 'function\s+completeActiveTest[\s\S]*await openTest\(nextTest\)')) {
    throw 'O teste aberto deve permitir registrar o resultado e avancar pela sequencia sem voltar para a lista.'
}
if (-not ($html -match 'id="labelEditForm"[\s\S]*name="modelo"[\s\S]*name="serial"[\s\S]*name="cpu"[\s\S]*name="ram"[\s\S]*name="disco"[\s\S]*name="gpu"[\s\S]*name="bateria"')) {
    throw 'A pagina Etiquetas deve permitir editar manualmente todos os dados impressos.'
}
if (-not ($app -match 'printOsInput[\s\S]*persistEditedOs\(\)[\s\S]*refreshOsVerification\(\)')) {
    throw 'A OS alterada na pagina Etiquetas deve ser persistida e conferida.'
}
if (-not ($app -match 'printBtn[\s\S]*api\("/api/print", body\)[\s\S]*showAppView\("home"\)')) {
    throw 'Depois de uma impressao confirmada, a interface deve voltar ao Menu.'
}
if (-not ($app -match 'submitCreateOs[\s\S]*setButtonBusy\(createButton, true, "Criando rastreador\.\.\."\)[\s\S]*api\("/api/create-os"[\s\S]*finally[\s\S]*setButtonBusy\(createButton, false\)')) {
    throw 'O botao Criar OS deve mostrar o andamento e bloquear cliques duplicados.'
}
if (-not ($app -match 'printBtn[\s\S]*setButtonBusy\(printButton, true, "Imprimindo etiqueta\.\.\."\)[\s\S]*api\("/api/print", body\)[\s\S]*finally[\s\S]*setButtonBusy\(printButton, false\)')) {
    throw 'O botao Imprimir etiqueta deve mostrar o andamento e bloquear cliques duplicados.'
}
if (-not ($portable -match 'void central\("/sincronizar-rastreador"[\s\S]*void central\("/status-os"')) {
    throw 'A interface deve liberar o botao apos imprimir e concluir rastreador e proxima OS em segundo plano.'
}
if (-not ($portable -match 'async function\s+findReachableServer[\s\S]*Promise\.any') -or
    -not ($portable -match 'async function\s+printOnce\(payload, timeout = 35000\)[\s\S]*fetchWithTimeout\(`\$\{base\}/imprimir`') -or
    -not ($portable -match 'const data = await printOnce\(payload\)')) {
    throw 'A impressao deve localizar o servidor em paralelo e enviar somente uma requisicao com timeout definido.'
}
if ($portable -match 'central\("/imprimir"') {
    throw 'A impressao nao pode repetir automaticamente o POST em varios enderecos.'
}
$printHandlerStart = $app.IndexOf('qs("printBtn").addEventListener')
$printHandlerEnd = $app.IndexOf('qs("fullscreenBtn").addEventListener', $printHandlerStart)
$printHandlerText = $app.Substring($printHandlerStart, $printHandlerEnd - $printHandlerStart)
if ($printHandlerText -match 'refreshOsVerification') {
    throw 'A impressao nao deve aguardar uma segunda consulta remota da OS antes de chegar ao spooler.'
}
if (-not ($printHandlerText -match 'persistEditedOs\([^)]*\)[\s\S]*api\("/api/print", body\)')) {
    throw 'A impressao rapida ainda deve persistir a OS selecionada antes do envio.'
}
if (-not ($html -match 'class="alert-created"[\s\S]*id="alertCreatedOs"[\s\S]*class="alert-next"[\s\S]*id="alertNextOs"')) {
    throw 'O pop-up deve destacar primeiro a OS criada e deixar a proxima OS como informacao secundaria.'
}
if (-not ($html -match 'id="homeView"[\s\S]*class="panel print-history-panel"[\s\S]*id="printHistoryList"')) {
    throw 'O historico das etiquetas deve aparecer no final da pagina Menu.'
}
if (-not ($app -match 'readPrintHistory[\s\S]*caij:print-history[\s\S]*slice\(0, 8\)')) {
    throw 'O historico deve preservar localmente somente as oito impressoes mais recentes.'
}
if (-not ($app -match 'printHistoryPanel[\s\S]*classList\.toggle\("is-empty", history\.length === 0\)')) {
    throw 'O historico vazio deve permanecer compacto no Menu.'
}
if (-not ($app -match 'workflowOverall"\)\.textContent = `\$\{completed\} de 4 etapas`')) {
    throw 'O andamento deve apresentar a contagem de etapas por extenso.'
}
if (-not ($app -match 'reviewSerialDivergence[\s\S]*showAppView\("labels"\)[\s\S]*refreshOsVerification')) {
    throw 'A divergencia de serial deve oferecer uma acao segura para conferir os dados.'
}
if (-not ($app -match 'testsCompletion"\)\.textContent = `\$\{passed \+ failed\} de \$\{values.length\} concluídos`[\s\S]*aria-pressed')) {
    throw 'A Central de Testes deve mostrar progresso geral e selecao acessivel dos resultados.'
}
if (-not ($style -match '\.tests-page \.test-row\.passed[\s\S]*\.tests-page \.test-row\.failed[\s\S]*\.test-actions button\[data-action="pass"\]\.selected')) {
    throw 'A Central de Testes deve diferenciar visualmente estados pendente, aprovado e reprovado.'
}
if (-not ($preview.Contains("'--auto-accept-camera-and-microphone-capture'")) -or
    -not ($preview.Contains('"--user-data-dir=$previewProfile"')) -or
    -not ($app -match 'confirmCameraTestPermission\(\)[\s\S]*requestUserMediaWithStartupRetry\(\{ video: true')) {
    throw 'No Windows, a confirmacao CAIJ deve ser a unica etapa antes da captura no perfil isolado do aplicativo.'
}
if (-not ($app -match 'function\s+requestUserMediaWithStartupRetry[\s\S]*attempts\s*=\s*isWindowsPreview\s*\?\s*3\s*:\s*1[\s\S]*450 \* \(attempt \+ 1\)')) {
    throw 'A primeira liberacao da camera no Windows deve ser repetida automaticamente antes de exibir erro.'
}
if ($preview -match 'Add-TemporaryEdgeCapturePolicy|VideoCaptureAllowedUrls|AudioCaptureAllowedUrls|HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge') {
    throw 'O InfoNotebook nao deve depender de acesso ao Registro para liberar camera e microfone.'
}
if (-not ($preview -match '\$lenovoPreflightPath\s*=\s*Join-Path \$PSScriptRoot ''PrepararLenovo\.ps1''')) {
    throw 'A interface Windows deve preservar o verificador da tecla de interrogacao Lenovo.'
}
if (-not ($preview -match 'SystemManufacturer[\s\S]*Scancode Map[\s\S]*Start-Process powershell\.exe[\s\S]*ExitCode -ne 0')) {
    throw 'O pre-check Lenovo deve detectar a correcao, executar o utilitario quando necessario e bloquear falhas.'
}
$preflightIndex = $preview.IndexOf('$lenovoPreflightPath')
$edgeLaunchIndex = $preview.IndexOf('$edgeProcess = Start-Process')
if ($preflightIndex -lt 0 -or $edgeLaunchIndex -le $preflightIndex) {
    throw 'O pre-check Lenovo deve terminar antes de a interface ser aberta.'
}
if (-not ($html -match 'class="verification-os"[\s\S]*class="verification-product"[\s\S]*class="verification-technician"[\s\S]*class="verification-serial"')) {
    throw 'O resumo da conferencia deve identificar os campos para um layout sem cortes.'
}
if (-not ($style -match '\.os-verification-grid strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;')) {
    throw 'As informacoes da conferencia devem quebrar linha em vez de serem cortadas.'
}
if (-not ($app -match 'api\("/api/create-os"[\s\S]*api\("/api/info", labelContext\)[\s\S]*showOsAlert\(data, true\)')) {
    throw 'A OS criada deve preparar os dados da etiqueta antes de exibir a confirmacao.'
}
if (-not ($app -match 'printCreatedOs[\s\S]*showAppView\("labels"\)[\s\S]*refreshOsVerification')) {
    throw 'A confirmacao da OS deve abrir diretamente a etiqueta preenchida.'
}
if (-not ($portable -match 'tipoEquipamento:\s*equipmentType')) {
    throw 'O tipo inferido no cadastro deve chegar ao payload da OS.'
}
if (-not ($portable.Contains('const configuration = /^Monitor$/i.test(type) ? ""'))) {
    throw 'Monitor nao deve receber configuracao automatica de notebook na observacao.'
}
if (-not ($app.Contains('el.hidden = isIdle'))) {
    throw 'O estado Pronto deve ficar oculto sem remover alertas operacionais.'
}
if (-not ($app.Contains('"bateria"'))) {
    throw 'O cartao de bateria deve completar o alinhamento das informacoes do notebook.'
}
if ($html -match 'Leitura autom.tica conclu.da') {
    throw 'O selo de leitura automatica concluida nao deve aparecer na interface.'
}
if (-not ($app -match 'windowsFields\s*=\s*\["modelo",\s*"serial",\s*"cpu",\s*"disco",\s*"gpu",\s*"ram",\s*"bateria"\]')) {
    throw 'No Windows, Disco deve preencher a coluna ao lado da CPU.'
}
if (-not ($app -match 'key === "bateria" \? "full"')) {
    throw 'No Windows, Bateria deve fechar toda a base da grade.'
}
if (-not ($app -match 'if \(isWindowsPreview\)[\s\S]*windows-keyboard[\s\S]*else[\s\S]*mac-keyboard')) {
    throw 'O mapa de teclado deve separar teclas Windows e Mac.'
}
if (-not ($app.Contains('return `TESTES: ${overall} | ${details}`'))) {
    throw 'O resumo dos testes nao deve ficar rotulado como teste do Mac.'
}

foreach ($check in $checks) {
    if (-not $check[0].Contains($check[1])) { throw "Trecho esperado nao encontrado: $($check[1])" }
}
if ($preview.Contains('unsafely-treat-insecure-origin-as-secure')) {
    throw 'A previa nao deve exibir o aviso de sinalizador inseguro do Edge.'
}
if ($preview -match 'EstimatedChargeRemaining') {
    throw 'A interface nova nao deve apresentar carga atual como se fosse saude da bateria.'
}
if ($preview -match 'saÃ|SaÃ') {
    throw 'A leitura da bateria nao pode conter texto UTF-8 corrompido.'
}
if (-not ($preview.Contains("[char]0x00FA"))) {
    throw 'O texto de saude da bateria deve ser seguro no Windows PowerShell 5.'
}
if (-not ($preview.Contains("*[local-name()='DesignCapacity']")) -or
    -not ($preview.Contains("*[local-name()='FullChargeCapacity']")) -or
    -not ($preview.Contains('100 * $fullTotal / $designTotal'))) {
    throw 'A saude da bateria deve comparar capacidade maxima atual com capacidade de projeto.'
}
if (-not ($preview.Contains("@('TotalDiskCapacity', 'TotalDataCapacity')"))) {
    throw 'A leitura do 3uTools deve priorizar a capacidade fisica nominal e usar a capacidade de dados apenas como fallback.'
}
if (-not ($preview.Contains("'MK473'='64GB'"))) {
    throw 'O leitor web deve reconhecer o iPad 9 MK473 como 64GB quando a consulta USB estiver indisponivel.'
}
if ($preview -notmatch 'Get-CaijWindowsStorageSummary\s+-Disks\s+\$allDisks' -or
    -not ((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'WindowsStorage.ps1') -Raw) -match 'InterfaceType[\s\S]*?Removable\|External')) {
    throw 'A leitura do Windows deve ignorar o pendrive e outros discos removiveis.'
}
if ($preview -notmatch 'Get-CimInstance\s+Win32_PhysicalMemory' -or
    $preview -notmatch 'function\s+Get-WindowsRamSummary[\s\S]*?Measure-Object\s+-Property\s+Capacity\s+-Sum') {
    throw 'A RAM do Windows deve usar a capacidade instalada dos modulos fisicos.'
}
if ($preview -notmatch 'Win32_PhysicalMemoryArray' -or $preview -notmatch 'SMBIOSMemoryType' -or
    $app -notmatch 'state\.info\.ramDetalhes' -or $html -notmatch 'name="ramDetalhes"') {
    throw 'A leitura de RAM deve mostrar geracao, posicoes e limite de identificacao de memoria soldada.'
}
if ($preview -notmatch 'function\s+ConvertTo-MarketedMemory') {
    throw 'A RAM deve ser normalizada para a capacidade comercial instalada.'
}
if ($preview -notmatch '\$isIpadWithoutImei\s*=\s*\$productType\s*-match\s*''\^iPad''\s*-and\s*\$imei\.Length\s*-eq\s*0') {
    throw 'A importacao web deve aceitar iPad Wi-Fi sem IMEI.'
}

Write-Output 'OK: Windows web preview tests'
