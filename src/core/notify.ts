import { spawn } from "child_process";

/**
 * Fire an OS-native toast notification (Windows 10+).
 * Runs asynchronously, never blocks, silently ignores all errors.
 */
export function notifyAutoHeal(patternId: string): void {
  const title = "\u{1F6E1}\uFE0F afd Auto-Healed";
  const body = `Silently fixed: ${patternId}`;

  // PowerShell BalloonTip — fire and forget
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Shield
    $n.BalloonTipTitle = '${title}'
    $n.BalloonTipText = '${body}'
    $n.BalloonTipIcon = 'Info'
    $n.Visible = $true
    $n.ShowBalloonTip(3000)
    Start-Sleep -Milliseconds 3500
    $n.Dispose()
  `.replace(/\n\s*/g, " ");

  try {
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Crash-only: silently ignore notification failures
  }
}
