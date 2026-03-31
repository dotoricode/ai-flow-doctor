#!/usr/bin/env bun
import { Command } from "commander";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { scoreCommand } from "./commands/score";
import { fixCommand } from "./commands/fix";
import { syncCommand } from "./commands/sync";
import { diagnoseCommand } from "./commands/diagnose";
import { doctorCommand } from "./commands/doctor";
import { watchCommand } from "./commands/watch";
import { vaccineCommand } from "./commands/vaccine";
import { langCommand } from "./commands/lang";
import { evolutionCommand } from "./commands/evolution";
import { mcpCommand } from "./commands/mcp";

const program = new Command();

program
  .name("afd")
  .description("Autonomous Flow Daemon - The Immune System for AI Workflows")
  .version("1.3.0");

program
  .command("start")
  .description("Start the afd daemon (background file watcher)")
  .option("--mcp", "Run in MCP stdio mode (for Claude Code tool integration)")
  .action(startCommand);

program
  .command("stop")
  .description("Stop the afd daemon")
  .action(stopCommand);

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
  .command("watch")
  .description("Real-time TUI dashboard — live S.E.A.M event stream")
  .action(watchCommand);

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

program.parse();
