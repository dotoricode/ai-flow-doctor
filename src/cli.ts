#!/usr/bin/env bun
import { Command } from "commander";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { restartCommand } from "./commands/restart";
import { statusCommand } from "./commands/status";
import { scoreCommand } from "./commands/score";
import { fixCommand } from "./commands/fix";
import { syncCommand } from "./commands/sync";
import { diagnoseCommand } from "./commands/diagnose";
import { doctorCommand } from "./commands/doctor";

import { vaccineCommand } from "./commands/vaccine";
import { langCommand } from "./commands/lang";
import { evolutionCommand } from "./commands/evolution";
import { mcpCommand } from "./commands/mcp";
import { statsCommand } from "./commands/stats";
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

program
  .command("start")
  .description("Start the afd daemon (background file watcher)")
  .option("--mcp", "Run in MCP stdio mode (for Claude Code tool integration)")
  .action(startCommand);

program
  .command("stop")
  .description("Stop the afd daemon")
  .option("--clean", "Remove all injected hooks and MCP registrations")
  .action(stopCommand);

program
  .command("restart")
  .description("Restart the afd daemon (stop + start)")
  .action(restartCommand);

program
  .command("status")
  .description("Quick health check — daemon, hooks, defenses, quarantine")
  .action(statusCommand);

program
  .command("score")
  .description("Show current diagnostic stats from the daemon")
  .action(scoreCommand);

program
  .command("fix")
  .description("Auto-fix detected issues in AI workflow config")
  .action(fixCommand);

program
  .command("sync")
  .description("Synchronize AI agent configs across team")
  .option("--push", "Push local antibodies to team vaccine store")
  .option("--pull", "Pull antibodies from team vaccine store")
  .option("--remote <url>", "Remote vaccine store URL (future)")
  .action(syncCommand);

program
  .command("doctor")
  .description("Deep health analysis with recommendations and auto-fix")
  .option("--fix", "Auto-fix detected issues")
  .action(doctorCommand);

program
  .command("diagnose")
  .description("Run headless diagnosis (used by auto-heal hooks)")
  .option("--format <type>", "Output format: a2a or human", "human")
  .option("--auto-heal", "Auto-apply patches for known antibodies")
  .action(diagnoseCommand);

program
  .command("vaccine [subcommand] [arg]")
  .description("Vaccine registry: list, search, install, publish")
  .action(vaccineCommand);

program
  .command("evolution")
  .description("Self-Evolution: analyze quarantined failures and generate lessons for AI agents")
  .action(evolutionCommand);

program
  .command("mcp [subcommand]")
  .description("MCP server management (install)")
  .action(mcpCommand);

program
  .command("lang [language]")
  .description("Show or change display language (en, ko)")
  .option("--list", "Show all supported languages")
  .action(langCommand);

program
  .command("stats")
  .description("Feature usage telemetry dashboard (developer-only)")
  .option("--days <n>", "Number of days to aggregate", "7")
  .action(statsCommand);

program.parse();
