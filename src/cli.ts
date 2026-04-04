#!/usr/bin/env bun
import { Command } from "commander";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { statusCommand } from "./commands/status";
import { scoreCommand } from "./commands/score";
import { dashboardCommand } from "./commands/dashboard";
import { fixCommand } from "./commands/fix";
import { syncCommand } from "./commands/sync";
import { diagnoseCommand } from "./commands/diagnose";

import { vaccineCommand } from "./commands/vaccine";
import { langCommand } from "./commands/lang";
import { evolutionCommand } from "./commands/evolution";
import { mcpCommand } from "./commands/mcp";
import { hooksCommand } from "./commands/hooks";
import { pluginCommand } from "./commands/plugin";
import { setupCommand } from "./commands/setup";
import { APP_VERSION } from "./version";
import { trackCliCommand } from "./core/telemetry";

const program = new Command();

program
  .name("afd")
  .description("Autonomous Flow Daemon - The Immune System for AI Workflows")
  .version(APP_VERSION);

program.hook("preAction", (thisCommand) => {
  trackCliCommand(thisCommand.name());
});

// ── Core Commands (Magic 5 + alpha) ──────────────────────────────────────────

program
  .command("setup")
  .description("Interactive one-command setup — daemon, MCP, CLAUDE.md, health check")
  .action(setupCommand);

program
  .command("start")
  .description("Start the afd daemon (background file watcher)")
  .option("--mcp", "Run in MCP stdio mode (for Claude Code tool integration)")
  .option("--restart", "Stop existing daemon first, then start fresh")
  .action(startCommand);

program
  .command("stop")
  .description("Stop the afd daemon")
  .option("--clean", "Remove all injected hooks and MCP registrations")
  .action(stopCommand);

program
  .command("score")
  .description("Show current diagnostic stats from the daemon")
  .action(scoreCommand);

program
  .command("fix")
  .description("Auto-fix detected issues in AI workflow config")
  .option("--deep", "Run full rule-based health analysis with auto-fix (prev. doctor --fix)")
  .action(fixCommand);

program
  .command("sync")
  .description("Synchronize AI agent configs across team")
  .option("--push", "Push local antibodies to team vaccine store")
  .option("--pull", "Pull antibodies from team vaccine store")
  .option("--remote <url>", "Remote vaccine store URL for push/pull")
  .option("--local-mesh", "Bidirectional sync with all live mesh peers (monorepo)")
  .action(syncCommand);

program
  .command("dashboard")
  .description("Live token savings dashboard — real-time TUI (Ctrl+C to exit)")
  .action(dashboardCommand);

// ── Tool Commands ────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Quick health check — daemon, hooks, defenses, quarantine")
  .action(statusCommand);

program
  .command("diagnose")
  .description("Run headless diagnosis (used by auto-heal hooks)")
  .option("--format <type>", "Output format: a2a or human", "human")
  .option("--auto-heal", "Auto-apply patches for known antibodies")
  .action(diagnoseCommand);

program
  .command("evolution")
  .description("Self-Evolution: analyze quarantined failures and generate lessons")
  .option("--generate", "Auto-generate validators from all quarantine patterns")
  .option("--suggest", "Suggest validators based on recurring failure patterns (prev. afd suggest)")
  .option("--cross", "Cross-project pattern correlation (prev. afd correlate)")
  .option("--days <n>", "Analysis window in days (with --suggest)", "30")
  .option("--min <n>", "Minimum frequency threshold (with --suggest)", "3")
  .option("--min-scopes <n>", "Minimum distinct scopes for hotspot (with --cross)", "2")
  .option("--apply", "Auto-generate validators for patterns found")
  .option("--include-local", "Include local-scope antibodies (with --cross)")
  .action(evolutionCommand);

program
  .command("vaccine [subcommand] [arg]")
  .description("Vaccine registry: list, search, install, publish")
  .action(vaccineCommand);

program
  .command("mcp [subcommand]")
  .description("MCP server management (install)")
  .action(mcpCommand);

program
  .command("hooks [subcommand]")
  .description("Hook Manager: inspect and sync hook ordering (afd → omc → user)")
  .action(hooksCommand);

program
  .command("lang [language]")
  .description("Show or change display language (en, ko)")
  .option("--list", "Show all supported languages")
  .action(langCommand);

program
  .command("plugin")
  .description("Manage third-party validator plugins (install, list, remove)")
  .argument("[subcommand]", "install | list | remove")
  .argument("[arg]", "npm package name or plugin name")
  .action(pluginCommand);

program.parse();
