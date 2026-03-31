import { spawn } from "child_process";
import { IS_WINDOWS, IS_MACOS } from "../platform";

/**
 * Fire an OS-native toast notification.
 * Runs asynchronously, never blocks, silently ignores all errors.
 *
 * - Windows 10+: PowerShell BalloonTip
 * - macOS: osascript display notification
 * - Linux: notify-send (libnotify)
 */
export function notifyAutoHeal(patternId: string): void {
  const title = "\u{1F6E1}\uFE0F afd Auto-Healed";
  const body = `Silently fixed: ${patternId}`;

  try {
    if (IS_WINDOWS) {
      notifyWindows(title, body);
    } else if (IS_MACOS) {
      notifyMacOS(title, body);
    } else {
      notifyLinux(title, body);
    }
  } catch {
    // Crash-only: silently ignore notification failures
  }
}

function notifyWindows(title: string, body: string): void {
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

  const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function notifyMacOS(title: string, body: string): void {
  const script = `display notification "${body}" with title "${title}"`;
  const child = spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function notifyLinux(title: string, body: string): void {
  const child = spawn("notify-send", [title, body, "--icon=dialog-information"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
