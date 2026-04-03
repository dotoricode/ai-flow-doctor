#!/usr/bin/env bun
import { Command } from "commander";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { restartCommand } from "./commands/restart";
import { statusCommand } from "./commands/status";
import { scoreCommand } from "./commands/score";
import { dashboardCommand } from "./commands/dashboard";
import { fixCommand } from "./commands/fix";
import { syncCommand } from "./commands/sync";
import { diagnoseCommand } from "./commands/diagnose";
import { doctorCommand } from "./commands/doctor";

import { vaccineCommand } from "./commands/vaccine";
import { langCommand } from "./commands/lang";
import { evolutionCommand } from "./commands/evolution";
import { mcpCommand } from "./commands/mcp";
import { statsCommand } from "./commands/stats";
import { hooksCommand } from "./commands/hooks";
import { benchmarkCommand } from "./commands/benchmark";
import { suggestCommand } from "./commands/suggest";
import { correlateCommand } from "./commands/correlate";
import { pluginCommand } from "./commands/plugin";
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
  .command("dashboard")
  .description("Live token savings dashboard — real-time TUI (Ctrl+C to exit)")
  .action(dashboardCommand);

program
  .command("fix")
  .description("Auto-fix detected issues in AI workflow config")
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
  .option("--generate", "Auto-generate validators from all quarantine patterns")
  .action(evolutionCommand);

program
  .command("suggest")
  .description("Suggest validators based on recurring failure patterns in mistake history")
  .option("--days <n>", "Analysis window in days", "30")
  .option("--min <n>", "Minimum frequency threshold", "3")
  .option("--apply", "Auto-generate validators for uncovered patterns")
  .option("--cross", "Annotate suggestions matching cross-project hotspots as Community Verified")
  .action(suggestCommand);

program
  .command("correlate")
  .description("Cross-project pattern correlation — surface Global Hotspot patterns across federated scopes")
  .option("--min-scopes <n>", "Minimum distinct scopes to qualify as a global hotspot", "2")
  .option("--apply", "Auto-generate global validators for uncovered hotspots")
  .option("--include-local", "Include local-scope antibodies in the analysis")
  .action(correlateCommand);

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

program
  .command("hooks [subcommand]")
  .description("Hook Manager: inspect and sync hook ordering (afd → omc → user)")
  .action(hooksCommand);

program
  .command("benchmark")
  .description("Hologram AST compression benchmark across all source files")
  .option("--sort <key>", "Sort by: savings (default), size, name")
  .option("--top <n>", "Show only top N files")
  .option("--json", "Output raw JSON for programmatic use")
  .action(benchmarkCommand);

program
  .command("plugin")
  .description("Manage third-party validator plugins (install, list, remove)")
  .argument("[subcommand]", "install | list | remove")
  .argument("[arg]", "npm package name or plugin name")
  .action(pluginCommand);

program.parse();
