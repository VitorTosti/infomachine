$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'InfoNotebookWindowsPreview.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){ throw 'Parser errors' }
foreach($name in @('Get-LocalTestRecordsPath','Read-LocalTestRecords','Save-LocalTestRecord')) {
    $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
    Invoke-Expression $node.Extent.Text
}
$ids='camera.image camera.capture keyboard.keys audio.speakers screen.pixels screen.artifacts trackpad.movement trackpad.buttons usb.inventory charger.connectors charger.firmness network.ethernet network.wifi hdmi.detection hdmi.image' -split ' '
$record=[pscustomobject]@{technician=('T' + [char]0x00E9 + 'cnico');serial='ABC';items=@($ids | ForEach-Object {[pscustomobject]@{id=$_;testId=($_ -split '\.')[0];label=$_;result='passed';notes=''}});mode='APROVADO';confirmedAt='2026-11-12T12:00:00.000Z';fingerprint='snapshot';notes=('Observa' + [char]0x00E7 + [char]0x00E3 + 'o')}
($record.items | Where-Object id -eq 'audio.speakers') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='Tom reproduzido nos lados esquerdo e direito';at='2026-11-16T12:00:00Z'}
($record.items | Where-Object id -eq 'trackpad.movement') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='20 movimentos detectados na area de teste';at='2026-11-16T12:00:00Z'}
($record.items | Where-Object id -eq 'trackpad.buttons') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='Cliques detectados: esquerdo 1, direito 1';at='2026-11-16T12:00:00Z'}
($record.items | Where-Object id -eq 'charger.connectors') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='Alimentacao mudou de bateria para tomada apos reconectar o carregador';at='2026-11-16T12:00:00Z'}
($record.items | Where-Object id -eq 'network.ethernet') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='Interface ethernet conectada: Rede; IP 192.168.1.2';at='2026-11-16T12:00:00Z'}
($record.items | Where-Object id -eq 'network.wifi') | Add-Member -NotePropertyName evidence -NotePropertyValue @{source='auto';detail='Interface wifi conectada: Wi-Fi; IP 192.168.1.3';at='2026-11-16T12:00:00Z'}
$path=Join-Path ([IO.Path]::GetTempPath()) ('caij-record-regression-'+[guid]::NewGuid().ToString('N')+'.json')
$legacyPath=$path+'.legacy.json'
try {
    $semEvidencia=ConvertFrom-Json ($record | ConvertTo-Json -Depth 20)
    ($semEvidencia.items | Where-Object id -eq 'audio.speakers').PSObject.Properties.Remove('evidence')
    $rejected=$false
    try{Save-LocalTestRecord -Record $semEvidencia -Path $path | Out-Null}catch{$rejected=$true}
    if(-not $rejected){throw 'Som sem evidencia aceito'}
    Save-LocalTestRecord -Record $record -Path $path | Out-Null
    Save-LocalTestRecord -Record $record -Path $path | Out-Null
    $rows=@(Read-LocalTestRecords -Path $path)
    if($rows.Count -ne 2 -or $rows[0].technician -ne $record.technician -or $rows[0].notes -ne $record.notes){throw 'Reopen/unicode regression'}
    if(-not [IO.File]::Exists($path+'.bak')){throw 'Backup missing'}
    $before=[IO.File]::ReadAllText($path)
    foreach($kind in @('incomplete','pending','failed')) {
        $invalid=ConvertFrom-Json ($record | ConvertTo-Json -Depth 20)
        if($kind -eq 'incomplete'){$invalid.items=@($invalid.items[0])}
        else {$invalid.items[0].result=$kind; $invalid.items[0].notes='reason'}
        $rejected=$false
        try{Save-LocalTestRecord -Record $invalid -Path $path | Out-Null}catch{$rejected=$true}
        if(-not $rejected -or [IO.File]::ReadAllText($path) -ne $before){throw "Invalid record changed archive: $kind"}
    }
    $notApplicable=ConvertFrom-Json ($record | ConvertTo-Json -Depth 20)
    $notApplicable.items[0].result='not_applicable'; $notApplicable.items[0].notes=''
    Save-LocalTestRecord -Record $notApplicable -Path $path | Out-Null
    foreach($result in @('failed','untested')) {
        $invalid=ConvertFrom-Json ($notApplicable | ConvertTo-Json -Depth 20)
        $invalid.mode='REGISTRADO'; $invalid.items[0].result=$result
        $rejected=$false
        try{Save-LocalTestRecord -Record $invalid -Path $path | Out-Null}catch{$rejected=$true}
        if(-not $rejected){throw 'Missing justification accepted'}
    }
    $legacy=ConvertFrom-Json ($record | ConvertTo-Json -Depth 20)
    $legacyIds='camera.image camera.capture keyboard.keys keyboard.shortcuts keyboard.layout audio.speakers audio.microphone audio.headphone screen.pixels screen.brightness screen.artifacts trackpad.movement trackpad.left trackpad.right trackpad.middle trackpad.scroll usb.inventory charger.recognition charger.charging charger.connector network.ethernet network.wifi hdmi.detection hdmi.image hdmi.audio' -split ' '
    $legacy.items=@($legacyIds | ForEach-Object {[pscustomobject]@{id=$_;testId=($_ -split '\.')[0];label=$_;result='passed';notes=''}})
    [IO.File]::WriteAllText($legacyPath,(ConvertTo-Json -InputObject @($legacy) -Depth 20),(New-Object Text.UTF8Encoding($false)))
    $legacyBefore=[IO.File]::ReadAllText($legacyPath)
    $historical=@(Read-LocalTestRecords -Path $legacyPath)
    if($historical.Count -ne 1 -or $historical[0].items.Count -ne $legacyIds.Count){throw 'Legacy history was filtered or changed'}
    $legacyRejected=$false
    try{Save-LocalTestRecord -Record $legacy -Path $legacyPath | Out-Null}catch{$legacyRejected=$true}
    if(-not $legacyRejected -or [IO.File]::ReadAllText($legacyPath) -ne $legacyBefore){throw 'Legacy approval reused or history changed'}
    Save-LocalTestRecord -Record $record -Path $legacyPath | Out-Null
    $historical=@(Read-LocalTestRecords -Path $legacyPath)
    if($historical.Count -ne 2 -or $historical[0].items.Count -ne $legacyIds.Count -or $historical[1].items.Count -ne $ids.Count){throw 'Saving current checklist changed legacy history'}
    Write-Output 'Durable records: simplified catalog, two writes/reopen, unicode, backup, legacy preservation and rejection without mutation OK'
} finally {
    if([IO.File]::Exists($path)){[IO.File]::Delete($path)}
    if([IO.File]::Exists($path+'.bak')){[IO.File]::Delete($path+'.bak')}
    if([IO.File]::Exists($legacyPath)){[IO.File]::Delete($legacyPath)}
    if([IO.File]::Exists($legacyPath+'.bak')){[IO.File]::Delete($legacyPath+'.bak')}
}
