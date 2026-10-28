$ErrorActionPreference = 'Stop'
$startupLogDirectory = Join-Path $env:LOCALAPPDATA 'CAIJ\Logs'
New-Item -ItemType Directory -Path $startupLogDirectory -Force | Out-Null
$startupLog = Join-Path $startupLogDirectory 'abertura.log'
function Write-StartupLog([string]$Message) {
    try { Add-Content -LiteralPath $startupLog -Value ('{0:o} PID={1} {2}' -f (Get-Date), $PID, $Message) -Encoding UTF8 } catch {}
}
Write-StartupLog "Inicio: $PSScriptRoot"
$mutex = New-Object Threading.Mutex($false, 'Local\CAIJ.InfoNotebook.Startup')
$ownsMutex = $false
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) {
        Write-StartupLog 'Outra instancia detectada; procurando janela.'
        $shell = New-Object -ComObject WScript.Shell
        $window = Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.MainWindowHandle -ne [IntPtr]::Zero -and
            ($_.MainWindowTitle -like 'CAIJ InfoNotebook*' -or $_.MainWindowTitle -eq 'InfoNotebook - Abrindo aplicativo')
        } | Select-Object -First 1
        if ($window) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CaijStartupWindow {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
            $null = [CaijStartupWindow]::ShowWindowAsync($window.MainWindowHandle, 9)
            $null = $shell.AppActivate($window.Id)
            $null = [CaijStartupWindow]::SetForegroundWindow($window.MainWindowHandle)
            Write-StartupLog "Janela existente restaurada: $($window.Id)"
        } else {
            Write-StartupLog 'Instancia ativa sem janela acessivel.'
            Add-Type -AssemblyName System.Windows.Forms
            [Windows.Forms.MessageBox]::Show('O InfoNotebook ainda esta iniciando ou encerrando. Aguarde alguns segundos e tente novamente.', 'InfoNotebook') | Out-Null
        }
        exit
    }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object Windows.Forms.Form
    $form.Text = 'InfoNotebook - Abrindo aplicativo'
    $form.ClientSize = New-Object Drawing.Size(500, 270)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'None'
    $form.BackColor = [Drawing.ColorTranslator]::FromHtml('#101827')
    $form.ControlBox = $false
    $label = New-Object Windows.Forms.Label
    $label.Text = 'Preparando seu ambiente'
    $label.AutoSize = $false
    $label.SetBounds(32, 114, 436, 38)
    $label.Font = New-Object Drawing.Font('Segoe UI', 19, [Drawing.FontStyle]::Bold)
    $label.ForeColor = [Drawing.ColorTranslator]::FromHtml('#F1F5FA')
    $brand = New-Object Windows.Forms.Label
    $brand.Text = 'InfoNotebook'
    $brand.SetBounds(124, 36, 300, 30)
    $brand.Font = New-Object Drawing.Font('Segoe UI', 15, [Drawing.FontStyle]::Bold)
    $brand.ForeColor = $label.ForeColor
    $caption = New-Object Windows.Forms.Label
    $caption.Text = 'CAIJ  /  EQUIPAMENTOS'
    $caption.SetBounds(125, 68, 300, 20)
    $caption.Font = New-Object Drawing.Font('Segoe UI', 8)
    $caption.ForeColor = [Drawing.ColorTranslator]::FromHtml('#85BCE3')
    $logo = New-Object Windows.Forms.PictureBox
    $logo.SetBounds(32, 30, 76, 62)
    $logo.SizeMode = 'Zoom'
    $logoPath = Join-Path $PSScriptRoot 'caij-logo.png'
    if (Test-Path -LiteralPath $logoPath) {
        $sourceLogo = [Drawing.Image]::FromFile($logoPath)
        try { $logoImage = New-Object Drawing.Bitmap($sourceLogo) } finally { $sourceLogo.Dispose() }
        $logo.Image = $logoImage
    }
    $detail = New-Object Windows.Forms.Label
    $detail.Text = 'Verificando atualizacoes e lendo o equipamento...'
    $detail.SetBounds(34, 157, 434, 28)
    $detail.Font = New-Object Drawing.Font('Segoe UI', 10)
    $detail.ForeColor = [Drawing.ColorTranslator]::FromHtml('#A5B4C8')
    $bar = New-Object Windows.Forms.Panel
    $bar.BackColor = [Drawing.ColorTranslator]::FromHtml('#26374C')
    $bar.SetBounds(34, 204, 432, 4)
    $pulse = New-Object Windows.Forms.Panel
    $pulse.BackColor = [Drawing.ColorTranslator]::FromHtml('#7ACDFA')
    $pulse.SetBounds(0, 0, 96, 4)
    $bar.Controls.Add($pulse)
    $hint = New-Object Windows.Forms.Label
    $hint.Text = 'O aplicativo abrira automaticamente.'
    $hint.SetBounds(34, 224, 432, 20)
    $hint.Font = New-Object Drawing.Font('Segoe UI', 9)
    $hint.ForeColor = [Drawing.ColorTranslator]::FromHtml('#8194AC')
    $form.Controls.AddRange(@($logo, $brand, $caption, $label, $detail, $bar, $hint))
    $animationClock = [Diagnostics.Stopwatch]::StartNew()
    $form.Show()
    $form.Activate()
    Write-StartupLog 'Carregamento exibido.'
    [Windows.Forms.Application]::DoEvents()
    $readyPath = Join-Path ([IO.Path]::GetTempPath()) ('caij-ready-' + [guid]::NewGuid().ToString('N'))
    $env:CAIJ_STARTUP_READY = $readyPath
    $launcher = Join-Path (Split-Path -Parent $PSScriptRoot) 'InfoNotebook.vbs'
    $worker = Start-Process wscript.exe -ArgumentList ('"{0}" --worker' -f $launcher) -WindowStyle Hidden -PassThru
    Write-StartupLog "Inicializador iniciado: $($worker.Id)"
    while (-not $worker.HasExited) {
        if ($form.Visible) { $pulse.Left = [int](($animationClock.ElapsedMilliseconds / 4) % ($bar.Width + $pulse.Width)) - $pulse.Width }
        if ($form.Visible -and (Test-Path -LiteralPath $readyPath)) { Write-StartupLog 'Interface carregada.'; $form.Hide() }
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 100
        $worker.Refresh()
    }
    Write-StartupLog "Inicializador encerrado: $($worker.ExitCode)"
} catch {
    Write-StartupLog "Erro: $($_.Exception.Message)"
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'InfoNotebook - Erro ao abrir') | Out-Null
} finally {
    if ($form) { $form.Dispose() }
    if ($logoImage) { $logoImage.Dispose() }
    if ($readyPath -and (Test-Path -LiteralPath $readyPath)) { Remove-Item -LiteralPath $readyPath -Force }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
