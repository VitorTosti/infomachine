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
            [Windows.Forms.MessageBox]::Show('O InfoNotebook ainda está iniciando ou encerrando. Aguarde alguns segundos e tente abrir novamente.', 'InfoNotebook') | Out-Null
        }
        exit
    }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object Windows.Forms.Form
    $form.Text = 'InfoNotebook - Abrindo aplicativo'
    $form.ClientSize = New-Object Drawing.Size(560, 350)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'None'
    $form.BackColor = [Drawing.ColorTranslator]::FromHtml('#0D1C2A')
    $form.ControlBox = $false
    $label = New-Object Windows.Forms.Label
    $label.Text = 'Abrindo o InfoNotebook'
    $label.AutoSize = $false
    $label.SetBounds(32, 111, 496, 42)
    $label.Font = New-Object Drawing.Font('Segoe UI', 21, [Drawing.FontStyle]::Bold)
    $label.ForeColor = [Drawing.ColorTranslator]::FromHtml('#F1F5FA')
    $brand = New-Object Windows.Forms.Label
    $brand.Text = 'InfoNotebook'
    $brand.SetBounds(142, 35, 360, 28)
    $brand.Font = New-Object Drawing.Font('Segoe UI', 15, [Drawing.FontStyle]::Bold)
    $brand.ForeColor = [Drawing.ColorTranslator]::FromHtml('#B2BACF')
    $brand.TextAlign = [Drawing.ContentAlignment]::MiddleLeft
    $logo = New-Object Windows.Forms.PictureBox
    $logo.SetBounds(32, 26, 92, 52)
    $logo.SizeMode = 'Zoom'
    $logoPath = Join-Path $PSScriptRoot 'caij-logo.png'
    if (Test-Path -LiteralPath $logoPath) {
        $sourceLogo = [Drawing.Image]::FromFile($logoPath)
        try { $logoImage = New-Object Drawing.Bitmap($sourceLogo) } finally { $sourceLogo.Dispose() }
        $logo.Image = $logoImage
    }
    $detail = New-Object Windows.Forms.Label
    $detail.Text = 'Verificando atualizações e preparando o equipamento...'
    $detail.SetBounds(34, 168, 492, 28)
    $detail.Font = New-Object Drawing.Font('Segoe UI', 9.5)
    $detail.ForeColor = [Drawing.ColorTranslator]::FromHtml('#B2BACF')
    $bar = New-Object Windows.Forms.Panel
    $bar.BackColor = [Drawing.ColorTranslator]::FromHtml('#1C2030')
    $bar.SetBounds(34, 219, 492, 4)
    $pulse = New-Object Windows.Forms.Panel
    $pulse.BackColor = [Drawing.ColorTranslator]::FromHtml('#84DFD0')
    $pulse.SetBounds(0, 0, 96, 4)
    $bar.Controls.Add($pulse)
    $hint = New-Object Windows.Forms.Label
    $hint.Text = 'A janela será aberta ao concluir a preparação.'
    $hint.SetBounds(34, 250, 492, 20)
    $hint.Font = New-Object Drawing.Font('Segoe UI', 9)
    $hint.ForeColor = [Drawing.ColorTranslator]::FromHtml('#A6AEC3')
    $form.Add_Paint({
        param($sender, $e)
        $border = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#2A2E3F'), 1)
        try { $e.Graphics.DrawRectangle($border, 0, 0, $sender.ClientSize.Width - 1, $sender.ClientSize.Height - 1) }
        finally { $border.Dispose() }
    })
    $divider = New-Object Windows.Forms.Panel
    $divider.SetBounds(34, 288, 492, 1)
    $divider.BackColor = [Drawing.ColorTranslator]::FromHtml('#2A2E3F')
    $bar.AccessibleName = 'Abertura do aplicativo em andamento'
    $elapsedLabel = New-Object Windows.Forms.Label
    $elapsedLabel.SetBounds(34, 305, 250, 20)
    $elapsedLabel.Font = New-Object Drawing.Font('Segoe UI', 9)
    $elapsedLabel.ForeColor = [Drawing.ColorTranslator]::FromHtml('#B2BACF')
    $elapsedLabel.Text = 'Tempo de abertura: 0 s'
    $versionLabel = New-Object Windows.Forms.Label
    $versionLabel.SetBounds(294, 305, 232, 20)
    $versionLabel.TextAlign = [Drawing.ContentAlignment]::MiddleRight
    $versionLabel.Font = New-Object Drawing.Font('Segoe UI', 8)
    $versionLabel.ForeColor = [Drawing.ColorTranslator]::FromHtml('#B2BACF')
    $startupVersionPath = Join-Path $PSScriptRoot 'caij_versao_app.txt'
    $versionLabel.Text = 'Versão local'
    try { if (Test-Path -LiteralPath $startupVersionPath) { $versionLabel.Text = 'v' + ([IO.File]::ReadAllText($startupVersionPath)).Trim() } } catch { }
    $form.Controls.AddRange(@($logo, $brand, $label, $detail, $bar, $hint, $divider, $elapsedLabel, $versionLabel))
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
        if ($form.Visible) {
            $elapsedLabel.Text = 'Tempo de abertura: {0} s' -f [int]$animationClock.Elapsed.TotalSeconds
            if ($animationClock.Elapsed.TotalSeconds -ge 20) { $hint.Text = 'A preparação está levando mais tempo. Aguarde.' }
        }
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
