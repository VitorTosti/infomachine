function ConvertTo-CaijStorageNumber {
    param($Value)
    [double]$number = 0
    if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Float,
        [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
    return 0.0
}

function Format-CaijDiskCapacity {
    param([double]$Bytes)
    if ($Bytes -le 0) { return 'N/A' }
    # Win32_DiskDrive.Size is decimal bytes. Do not divide by 1 GiB here:
    # a marketed 320 GB drive would otherwise appear as 298 GB/256 GB.
    $decimalGb = $Bytes / 1000000000
    $sizes = @(32, 64, 120, 128, 240, 250, 256, 320, 480, 500, 512, 750, 960, 1000, 1024, 2000, 2048, 4000, 4096)
    $nearest = $sizes | Sort-Object { [math]::Abs([double]$_ - $decimalGb) } | Select-Object -First 1
    if ([math]::Abs([double]$nearest - $decimalGb) / $decimalGb -gt 0.08) {
        return "$([math]::Round($decimalGb))GB"
    }
    if ($nearest -in @(1000, 1024)) { return '1TB' }
    if ($nearest -in @(2000, 2048)) { return '2TB' }
    if ($nearest -in @(4000, 4096)) { return '4TB' }
    return "${nearest}GB"
}

function Get-CaijDiskKind {
    param($Disk, [object[]]$PhysicalDisks = @())
    $serial = ([string]$Disk.SerialNumber -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
    $model = ([string]$Disk.Model).Trim()
    $usableSerial = $serial -and $serial -notmatch '^(0+|F+)$'
    $internalPhysicalDisks = @($PhysicalDisks | Where-Object { ([string]$_.BusType) -notmatch '^(?i:USB|SD|MMC)$' })
    $matches = @()
    if ($usableSerial) {
        $matches = @($internalPhysicalDisks | Where-Object {
            $theirSerial = ([string]$_.SerialNumber -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
            $theirSerial -and $theirSerial -notmatch '^(0+|F+)$' -and $serial -eq $theirSerial
        })
    }
    if ($matches.Count -ne 1 -and $model) {
        # Controllers may expose the same generic name for several drives. A
        # name alone cannot safely transfer one drive's SSD type to another.
        $matches = @($internalPhysicalDisks | Where-Object {
            $physicalSize = ConvertTo-CaijStorageNumber $_.Size
            $diskSize = ConvertTo-CaijStorageNumber $Disk.Size
            $theirSerial = ([string]$_.SerialNumber -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
            $serialsConflict = $usableSerial -and $theirSerial -and
                $theirSerial -notmatch '^(0+|F+)$' -and $serial -ne $theirSerial
            $physicalSize -gt 0 -and $diskSize -gt 0 -and
            -not $serialsConflict -and
            ([math]::Abs($physicalSize - $diskSize) / $diskSize) -lt 0.02 -and
            ([string]$_.FriendlyName).Trim() -eq $model
        })
    }
    if ($matches.Count -eq 1) {
        if ((ConvertTo-CaijStorageNumber $matches[0].SpindleSpeed) -gt 0) { return 'HDD' }
        $physicalKind = ([string]$matches[0].MediaType).Trim().ToUpperInvariant()
        if ($physicalKind -in @('SSD', 'HDD')) { return $physicalKind }
    }
    if (([string]$Disk.MediaType) -match '(?i)SSD|Solid.State') { return 'SSD' }
    if (([string]$Disk.MediaType) -match '(?i)\bHDD\b') { return 'HDD' }
    if ($model -match '(?i)NVME|\bSSD\b|Solid.State') { return 'SSD' }
    if ($model -match '(?i)\bHDD\b|Hard.Disk') { return 'HDD' }
    return 'Disco'
}

function Get-CaijWindowsStorageSummary {
    param([object[]]$Disks, [object[]]$PhysicalDisks = @())
    $internal = @($Disks | Where-Object {
        $_ -and ([string]$_.InterfaceType) -ne 'USB' -and
        ([string]$_.MediaType) -notmatch '(?i)Removable|External' -and
        ([string]$_.PNPDeviceID) -notmatch '(?i)USBSTOR|\\VEN_USB' -and
        (ConvertTo-CaijStorageNumber $_.Size) -gt 0
    } | Sort-Object Index)
    if ($internal.Count -eq 0) { return 'N/A' }
    $items = foreach ($disk in $internal) {
        $capacity = Format-CaijDiskCapacity -Bytes (ConvertTo-CaijStorageNumber $disk.Size)
        $kind = Get-CaijDiskKind -Disk $disk -PhysicalDisks $PhysicalDisks
        "$capacity $kind"
    }
    return ($items -join ' + ')
}
