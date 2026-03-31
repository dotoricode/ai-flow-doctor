/**
 * OS Locale Detection — cached per-process.
 *
 * Priority:
 *   0. ~/.afdrc config file (persistent user preference via `afd lang`)
 *   1. AFD_LANG env (explicit override per-session)
 *   2. LC_ALL / LANG / LANGUAGE env (user shell config, skip "C"/"POSIX")
 *   3. macOS AppleLocale (system preferences — solves LANG=C.UTF-8 on Korean macOS)
 *   4. Intl API (runtime default)
 *   5. Default: "ko"
 */

import { execSync } from "child_process";
import { readConfig } from "./config";

export type SupportedLang = "en" | "ko";

const SUPPORTED: SupportedLang[] = ["en", "ko"];

let cached: SupportedLang | null = null;

function isSupported(value: string): value is SupportedLang {
  return SUPPORTED.includes(value as SupportedLang);
}

function matchKo(value: string): boolean {
  return value.startsWith("ko");
}

/** Detect system language. Returns 'ko' or 'en'. */
export function getSystemLanguage(): SupportedLang {
  if (cached) return cached;

  // 0. Persistent config (~/.afdrc)
  const rc = readConfig();
  if (rc.lang && isSupported(rc.lang)) {
    cached = rc.lang as SupportedLang;
    return cached;
  }

  // 1. Explicit env override
  const afdLang = process.env.AFD_LANG ?? "";
  if (isSupported(afdLang)) { cached = afdLang; return cached; }
  if (matchKo(afdLang)) { cached = "ko"; return cached; }

  // 2. Standard env — skip generic "C" / "POSIX"
  const envLang = process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || "";
  if (envLang !== "" && !envLang.startsWith("C") && !envLang.startsWith("POSIX")) {
    if (matchKo(envLang)) { cached = "ko"; return cached; }
    cached = "en";
    return cached;
  }

  // 3. macOS: AppleLocale
  if (process.platform === "darwin") {
    try {
      const appleLocale = execSync("defaults read -g AppleLocale", {
        encoding: "utf-8",
        timeout: 500,
      }).trim();
      if (matchKo(appleLocale)) { cached = "ko"; return cached; }
    } catch {
      // Not macOS or defaults unavailable
    }
  }

  // 4. Intl API fallback
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (matchKo(intlLocale)) { cached = "ko"; return cached; }
  } catch {
    // Fallback to default
  }

  // 5. Default
  cached = "ko";
  return cached;
}

/** Get list of supported languages. */
export function getSupportedLanguages(): SupportedLang[] {
  return [...SUPPORTED];
}

/** Override locale (for testing or after `afd lang` write). */
export function setLanguageOverride(lang: SupportedLang | null): void {
  cached = lang;
}
