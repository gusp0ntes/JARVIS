$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$applications = [System.Collections.Generic.List[object]]::new()
$knownPaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function Add-Executable([string]$candidate, [string]$displayName) {
    $candidate = [Environment]::ExpandEnvironmentVariables($candidate.Trim().Trim('"'))
    if ($candidate -notmatch '(?i)\.exe$' -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { return }
    $fileName = [IO.Path]::GetFileNameWithoutExtension($candidate)
    if ($fileName -match '(?i)(unins|uninstall|updat|crash|helper|service|setup|install|reporter|notification|elevation|diagnostic|_proxy$)') { return }
    if (-not $knownPaths.Add($candidate)) { return }
    if (-not $displayName) {
        $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($candidate)
        $displayName = $version.FileDescription
        if (-not $displayName) { $displayName = $fileName }
    }
    $applications.Add([pscustomobject]@{ name = $displayName; path = $candidate; executable = [IO.Path]::GetFileName($candidate); iconPath = $candidate })
}

# App Paths includes applications registered for the current user and both architectures.
foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')) {
    foreach ($key in Get-ChildItem -LiteralPath $root) {
        Add-Executable ([string]$key.GetValue('')) ''
    }
}

# Packaged apps have a stable AppID, even when an update changes their executable directory.
$packages = @{}
foreach ($package in Get-AppxPackage) { $packages[$package.PackageFamilyName] = $package }
foreach ($startApp in Get-StartApps) {
    if ($startApp.AppID -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*![a-zA-Z0-9][a-zA-Z0-9._-]*$') { continue }
    $family, $applicationId = $startApp.AppID -split '!', 2
    $iconPath = $null
    $executable = 'Aplicativo do Windows'
    $package = $packages[$family]
    if ($package) {
        $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
        $entry = $manifest.Package.Applications.Application | Where-Object { $_.Id -eq $applicationId } | Select-Object -First 1
        if ($entry.Executable) {
            $executable = [IO.Path]::GetFileName([string]$entry.Executable)
            $iconPath = Join-Path $package.InstallLocation ([string]$entry.Executable)
        }
    }
    $applications.Add([pscustomobject]@{ name = $startApp.Name; path = "shell:AppsFolder\$($startApp.AppID)"; executable = $executable; iconPath = $iconPath })
}

$roots = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($directory in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, "$env:LOCALAPPDATA\Programs", "$env:LOCALAPPDATA\Microsoft\Teams", [Environment]::GetFolderPath('Desktop'), "$env:PUBLIC\Desktop")) {
    if ($directory -and (Test-Path -LiteralPath $directory -PathType Container)) { [void]$roots.Add($directory) }
}
foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($key in Get-ItemProperty -Path "$root\*") {
        if ($key.InstallLocation -and (Test-Path -LiteralPath $key.InstallLocation -PathType Container)) { [void]$roots.Add($key.InstallLocation) }
        if ($key.DisplayIcon -match '^"?(.+?\.exe)"?(?:,[-\d]+)?$') { Add-Executable $Matches[1] $key.DisplayName }
    }
}

# Bounded breadth-first scan: discover standalone executables without walking entire drives.
$queue = [System.Collections.Generic.Queue[object]]::new()
$visited = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($root in $roots) { $queue.Enqueue(@{ path = $root; depth = 0 }) }
$deadline = [DateTime]::UtcNow.AddSeconds(10)
while ($queue.Count -gt 0 -and $visited.Count -lt 3000 -and [DateTime]::UtcNow -lt $deadline) {
    $directory = $queue.Dequeue()
    if (-not $visited.Add($directory.path)) { continue }
    foreach ($entry in Get-ChildItem -LiteralPath $directory.path) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        if ($entry.PSIsContainer) {
            if ($directory.depth -lt 3 -and $entry.Name -notmatch '^(?i:WindowsApps|Windows Kits|node_modules|resources|locales|cache|Installer|Microsoft SDKs|Git)$') {
                $queue.Enqueue(@{ path = $entry.FullName; depth = $directory.depth + 1 })
            }
        } elseif ($entry.Extension -eq '.exe') { Add-Executable $entry.FullName '' }
    }
}
ConvertTo-Json -InputObject @($applications.ToArray()) -Compress -Depth 3
