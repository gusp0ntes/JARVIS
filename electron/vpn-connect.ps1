param(
  [string]$VpnName = $env:JARVIS_VPN_NAME,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($VpnName)) {
  throw 'A VPN name is required.'
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class VpnConnectButton
{
    private const uint WM_GETTEXT = 0x000D;
    private const uint WM_COMMAND = 0x0111;
    private const uint SMTO_ABORTIFHUNG = 0x0002;

    private delegate bool EnumChildCallback(IntPtr window, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr window, EnumChildCallback callback, IntPtr data);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool IsWindowEnabled(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessageTimeout(
        IntPtr window, uint message, IntPtr wParam, StringBuilder text,
        uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static bool TryClick(IntPtr dialog)
    {
        if (!IsWindowVisible(dialog) || !IsWindowEnabled(dialog))
            return false;

        bool clicked = false;
        EnumChildWindows(dialog, (control, data) =>
        {
            var className = new StringBuilder(32);
            GetClassName(control, className, className.Capacity);
            if (!className.ToString().Equals("Button", StringComparison.OrdinalIgnoreCase) ||
                !IsWindowVisible(control) || !IsWindowEnabled(control))
                return true;

            var text = new StringBuilder(128);
            IntPtr length;
            if (SendMessageTimeout(control, WM_GETTEXT, (IntPtr)text.Capacity, text,
                SMTO_ABORTIFHUNG, 200, out length) == IntPtr.Zero)
                return true;

            // Win32 captions can contain an ampersand that marks a keyboard shortcut.
            string label = text.ToString().Replace("&", "").Trim();
            if (!label.Equals("Conectar", StringComparison.OrdinalIgnoreCase) &&
                !label.Equals("Connect", StringComparison.OrdinalIgnoreCase))
                return true;

            IntPtr parent = GetParent(control);
            if (parent == IntPtr.Zero)
                return true;

            // BN_CLICKED is zero, so only the control ID is needed in wParam.
            var controlId = (IntPtr)(GetDlgCtrlID(control) & 0xffff);
            clicked = PostMessage(parent, WM_COMMAND, controlId, control);
            return !clicked;
        }, IntPtr.Zero);

        return clicked;
    }
}
'@

$vpnName = $VpnName.Trim()
$dialogTitles = @("Conectar $vpnName", "Connect $vpnName")
$timer = [Diagnostics.Stopwatch]::StartNew()
while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
  foreach ($vpnProcess in (Get-Process -Name rasphone -ErrorAction SilentlyContinue)) {
    $window = $vpnProcess.MainWindowHandle
    if ($window -ne [IntPtr]::Zero -and $vpnProcess.MainWindowTitle -in $dialogTitles -and
        [VpnConnectButton]::TryClick($window)) {
      Write-Output '[auto-vpn] Connect button selected by its Windows label.'
      exit 0
    }
  }

  Start-Sleep -Milliseconds 300
}

Write-Output '[auto-vpn] Timed out waiting for the Connect button.'
exit 2
