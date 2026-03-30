#!/usr/bin/env bun
/**
 * afd status line script — for shell prompts (Starship, Zsh, etc.)
 * Also callable from Claude Code's statusline-command.
 *
 * Reads .afd/daemon.port, fetches /mini-status, outputs a one-liner.
 * If daemon is unreachable, outputs OFF state.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PORT_FILE = resolve(import.meta.dirname, "..", ".afd", "daemon.port");

async function main() {
  if (!existsSync(PORT_FILE)) {
    process.stdout.write("\u{1F6E1}\uFE0F afd: OFF");
    return;
  }

  const port = readFileSync(PORT_FILE, "utf-8").trim();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/mini-status`, {
      signal: AbortSignal.timeout(500),
    });
    const data = (await res.json()) as {
      status: string;
      healed_count: number;
      last_healed: string | null;
    };

    const parts = [`\u{1F6E1}\uFE0F afd: ${data.status}`];
    if (data.healed_count > 0) {
      parts.push(`\u{1FA79} ${data.healed_count} Healed`);
    }
    if (data.last_healed) {
      parts.push(`last: ${data.last_healed}`);
    }
    process.stdout.write(parts.join(" | "));
  } catch {
    process.stdout.write("\u{1F6E1}\uFE0F afd: OFF");
  }
}

main();
