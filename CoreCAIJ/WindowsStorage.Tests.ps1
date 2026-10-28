$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WindowsStorage.ps1')

function Assert-Storage($Actual, $Expected) {
    if ($Actual -ne $Expected) { throw "Esperado '$Expected'; recebido '$Actual'" }
}

$ssd = [pscustomobject]@{ Index=0; Size=256060514304; InterfaceType='SCSI'; MediaType='Fixed hard disk media'; Model='FAST SSD'; SerialNumber='SSD1' }
$hdd = [pscustomobject]@{ Index=1; Size=500107862016; InterfaceType='SATA'; MediaType='Fixed hard disk media'; Model='Generic Device'; SerialNumber='HDD1' }
$usb = [pscustomobject]@{ Index=2; Size=1000204886016; InterfaceType='SCSI'; MediaType='External hard disk media'; Model='USB Drive'; SerialNumber='USB1' }
$physical = @(
    [pscustomobject]@{ FriendlyName='FAST SSD'; SerialNumber='SSD1'; MediaType='SSD' },
    [pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='HDD1'; MediaType='HDD' }
)
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($ssd,$hdd,$usb) -PhysicalDisks $physical) '256GB SSD + 500GB HDD'
$disk320 = [pscustomobject]@{ Index=0; Size=320072933376; InterfaceType='SATA'; MediaType='Fixed hard disk media'; Model='Generic Device'; SerialNumber='A' }
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($disk320) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='A'; MediaType='HDD' })) '320GB HDD'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($disk320) -PhysicalDisks @()) '320GB Disco'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @([pscustomobject]@{ Index=0; Size=1000204886016; InterfaceType='SATA'; MediaType='Fixed hard disk media'; Model='Unknown'; SerialNumber='B' }) -PhysicalDisks @()) '1TB Disco'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($usb) -PhysicalDisks @()) 'N/A'
$sameNameHdd = [pscustomobject]@{ Index=1; Size=320072933376; InterfaceType='SATA'; MediaType='Fixed hard disk media'; Model='Generic Device'; SerialNumber='HDD320' }
$sameNamePhysical = @(
    [pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='SSD256'; Size=256060514304; MediaType='SSD'; BusType='SATA'; SpindleSpeed=0 },
    [pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='HDD320'; Size=320072933376; MediaType='HDD'; BusType='SATA'; SpindleSpeed=5400 }
)
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($sameNameHdd) -PhysicalDisks $sameNamePhysical) '320GB HDD'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($sameNameHdd) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='OTHER'; Size=320072933376; MediaType='SSD'; BusType='SATA' })) '320GB Disco'
$unknownSerialHdd = [pscustomobject]@{ Index=0; Size=320072933376; InterfaceType='SATA'; MediaType='Fixed hard disk media'; Model='Generic Device'; SerialNumber='0000000000000000' }
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($unknownSerialHdd) -PhysicalDisks $sameNamePhysical) '320GB HDD'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($unknownSerialHdd) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='0000000000000000'; Size=256060514304; MediaType='SSD'; BusType='SATA' })) '320GB Disco'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($unknownSerialHdd) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='0000000000000000'; Size=320072933376; MediaType='SSD'; BusType='USB' })) '320GB Disco'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($unknownSerialHdd) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='0000000000000000'; Size=320072933376; MediaType='SSD'; BusType='SATA'; SpindleSpeed=5400 })) '320GB HDD'
Assert-Storage (Get-CaijWindowsStorageSummary -Disks @($unknownSerialHdd) -PhysicalDisks @([pscustomobject]@{ FriendlyName='Generic Device'; SerialNumber='0000000000000000'; Size=320072933376; MediaType='HDD'; BusType='SATA'; SpindleSpeed='Unknown' })) '320GB HDD'
'PASS: discos Windows preservam capacidade, tipo e multiplas unidades sem presumir SSD.'
