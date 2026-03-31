#!/usr/bin/env bun
import { Command } from "commander";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { scoreCommand } from "./commands/score";
import { fixCommand } from "./commands/fix";
import { syncCommand } from "./commands/sync";
import { diagnoseCommand } from "./commands/diagnose";

const program = new Command();

program
  .name("afd")
  .description("Autonomous Flow Daemon - The Immune System for AI Workflows")
  .version("1.0.0");

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
  .action(syncCommand);

program
  .command("diagnose")
  .description("Run headless diagnosis (used by auto-heal hooks)")
  .option("--format <type>", "Output format: a2a or human", "human")
  .option("--auto-heal", "Auto-apply patches for known antibodies")
  .action(diagnoseCommand);

program.parse();
