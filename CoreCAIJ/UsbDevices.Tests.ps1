$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'InfoNotebookWindowsPreview.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){ throw 'Parser errors' }
$node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-LocalUsbDevices'},$true)
if(-not $node){ throw 'Leitor USB ausente.' }
Invoke-Expression $node.Extent.Text
function Get-CimInstance { param($ClassName,$Filter,$ErrorAction)
  @([pscustomobject]@{PNPDeviceID='USB\VID_1234&PID_5678\ABC';Name='Pendrive de teste';ConfigManagerErrorCode=0},
    [pscustomobject]@{PNPDeviceID='USB\VID_1111&PID_2222\HUB';Name='Generic USB Hub';ConfigManagerErrorCode=0},
    [pscustomobject]@{PNPDeviceID='USB\VID_3333&PID_4444\NOLOC';Name='Adaptador de teste';ConfigManagerErrorCode=0},
    [pscustomobject]@{PNPDeviceID='USB\VID_5555&PID_6666\OLD';Name='Desconectado';ConfigManagerErrorCode=22})
}
function Get-PnpDeviceProperty { param($InstanceId,$KeyName,$ErrorAction)
  if($InstanceId -match 'NOLOC'){ throw 'Sem localização' }
  [pscustomobject]@{Data=@('PCIROOT(0)#PCI(1400)#USBROOT(0)#USB(3)')}
}
$devices=@(Get-LocalUsbDevices)
if($devices.Count -ne 2){ throw "Contagem inesperada: $($devices.Count)" }
if($devices[0].portKey -ne 'PCIROOT(0)#PCI(1400)#USBROOT(0)#USB(3)'){ throw 'Porta física não preservada.' }
if($devices[1].portKey -ne ''){ throw 'Localização ausente não deve ser inventada.' }
Write-Output 'USB: dispositivo presente, hub excluído e localização ausente explícita OK'
