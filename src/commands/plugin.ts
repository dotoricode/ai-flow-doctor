/**
 * afd plugin — Third-party validator plugin manager
 *
 * Sub-commands:
 *   afd plugin install <npm-package>   — install a validator plugin from npm
 *   afd plugin list                    — list installed plugins
 *   afd plugin remove <name>           — uninstall a plugin
 */

import { installPlugin, listPlugins, removePlugin } from "../core/plugin-manager";
import { getSystemLanguage } from "../core/locale";

const msgs = {
  en: {
    usage: `Usage:
  afd plugin install <npm-package>   Install a validator plugin from npm
  afd plugin list                    List installed plugins
  afd plugin remove <name>           Uninstall a plugin`,
    noPlugins: "No plugins installed.",
    installing: "Installing",
    installed: "Installed Plugins",
  },
  ko: {
    usage: `사용법:
  afd plugin install <npm-package>   npm 플러그인 설치
  afd plugin list                    설치된 플러그인 목록
  afd plugin remove <name>           플러그인 제거`,
    noPlugins: "설치된 플러그인이 없습니다.",
    installing: "설치 중",
    installed: "설치된 플러그인",
  },
};

const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const W = 58;
function hline(l: string, r: string) { return `${l}${BOX.h.repeat(W)}${r}`; }
function row(s: string) {
  const pad = Math.max(0, W - 2 - s.length);
  return `${BOX.v} ${s}${" ".repeat(pad)} ${BOX.v}`;
}

export async function pluginCommand(subcommand?: string, arg?: string) {
  const lang = getSystemLanguage();
  const m = msgs[lang];

  if (!subcommand) {
    console.log(m.usage);
    return;
  }

  switch (subcommand) {
    case "install": {
      if (!arg) {
        console.error("Usage: afd plugin install <npm-package>");
        process.exit(1);
      }
      console.log(`🔌 ${m.installing}: ${arg} …`);
      const result = installPlugin(arg);
      console.log(hline(BOX.tl, BOX.tr));
      if (result.success) {
        console.log(row(`✅ ${result.message}`));
        if (result.manifest?.description) {
          console.log(row(`   ${result.manifest.description}`));
        }
        console.log(row("   Hot-reload active — daemon picks this up instantly."));
      } else {
        console.log(row(`❌ ${result.message}`));
      }
      console.log(hline(BOX.bl, BOX.br));
      if (!result.success) process.exit(1);
      break;
    }

    case "list": {
      const plugins = listPlugins();
      console.log(hline(BOX.tl, BOX.tr));
      console.log(row(`🔌 ${m.installed}`));
      console.log(hline(BOX.ml, BOX.mr));
      if (plugins.length === 0) {
        console.log(row(m.noPlugins));
      } else {
        for (const p of plugins) {
          console.log(row(`📦 ${p.package}@${p.version}`));
          if (p.description) console.log(row(`   ${p.description}`));
          console.log(row(`   validator: .afd/validators/${p.validatorFile}`));
          console.log(row(`   installed: ${p.installDate.slice(0, 10)}`));
          console.log(row(""));
        }
      }
      console.log(hline(BOX.bl, BOX.br));
      break;
    }

    case "remove": {
      if (!arg) {
        console.error("Usage: afd plugin remove <name>");
        process.exit(1);
      }
      const result = removePlugin(arg);
      console.log(hline(BOX.tl, BOX.tr));
      console.log(row(result.success ? `✅ ${result.message}` : `❌ ${result.message}`));
      console.log(hline(BOX.bl, BOX.br));
      if (!result.success) process.exit(1);
      break;
    }

    default:
      console.log(m.usage);
  }
}
