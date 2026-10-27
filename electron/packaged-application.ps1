param(
    [ValidateSet('Launch', 'Stop')][string]$Mode = 'Launch',
    [string]$AppId,
    [int]$ProcessId,
    [string]$StartedAt
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

if ($Mode -eq 'Stop') {
    $applicationProcess = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    # Never close an unrelated process that has reused the original PID.
    if ($applicationProcess -and $applicationProcess.StartTime.ToUniversalTime().ToString('o') -eq $StartedAt) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $ProcessId /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    exit 0
}

if ($AppId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*![a-zA-Z0-9][a-zA-Z0-9._-]*$') { throw 'AppID inválido.' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Jarvis {
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IApplicationActivationManager {
        [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
        [PreserveSig] int ActivateForFile(IntPtr appId, IntPtr items, IntPtr verb, out uint processId);
        [PreserveSig] int ActivateForProtocol(IntPtr appId, IntPtr items, out uint processId);
    }
    public static class PackagedApplication {
        public static uint Launch(string appId) {
            var manager = (IApplicationActivationManager)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
            try {
                uint processId;
                Marshal.ThrowExceptionForHR(manager.ActivateApplication(appId, null, 0, out processId));
                return processId;
            } finally { Marshal.ReleaseComObject(manager); }
        }
    }
}
'@
$existingProcesses = @{}
foreach ($item in Get-Process) {
    try { $existingProcesses[$item.Id] = $item.StartTime.ToUniversalTime().ToString('o') } catch {}
}
$launchedId = [Jarvis.PackagedApplication]::Launch($AppId)
$launched = Get-Process -Id $launchedId
$started = $launched.StartTime.ToUniversalTime().ToString('o')
@{ pid = $launchedId; startedAt = $started; owned = $existingProcesses[$launchedId] -ne $started } | ConvertTo-Json -Compress
