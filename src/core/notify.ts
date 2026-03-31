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

/** Escape single quotes for PowerShell string literals */
function escapePS(s: string): string {
  return s.replace(/'/g, "''");
}

/** Escape double quotes and backslashes for AppleScript string literals */
function escapeAS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeSpawn(cmd: string, args: string[], opts: Record<string, unknown> = {}): void {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", ...opts });
    child.unref();
  } catch {
    // Binary not found or spawn failed — silently ignore
  }
}

function notifyWindows(title: string, body: string): void {
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Shield
    $n.BalloonTipTitle = '${escapePS(title)}'
    $n.BalloonTipText = '${escapePS(body)}'
    $n.BalloonTipIcon = 'Info'
    $n.Visible = $true
    $n.ShowBalloonTip(3000)
    Start-Sleep -Milliseconds 3500
    $n.Dispose()
  `.replace(/\n\s*/g, " ");

  safeSpawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
}

function notifyMacOS(title: string, body: string): void {
  const script = `display notification "${escapeAS(body)}" with title "${escapeAS(title)}"`;

  safeSpawn("osascript", ["-e", script]);
}

function notifyLinux(title: string, body: string): void {
  safeSpawn("notify-send", [title, body, "--icon=dialog-information"]);
}
