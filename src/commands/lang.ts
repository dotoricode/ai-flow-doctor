import { getSystemLanguage, getSupportedLanguages, setLanguageOverride } from "../core/locale";
import type { SupportedLang } from "../core/locale";
import { writeConfig, getConfigPath } from "../core/config";
import { getMessages, t } from "../core/i18n/messages";

export function langCommand(targetLang?: string, options?: { list?: boolean }) {
  const currentLang = getSystemLanguage();
  const msg = getMessages(currentLang);
  const supported = getSupportedLanguages();

  // afd lang --list
  if (options?.list) {
    console.log(msg.LANG_LIST_TITLE);
    for (const lang of supported) {
      const marker = lang === currentLang ? " ← current" : "";
      console.log(`  ${lang}${marker}`);
    }
    return;
  }

  // afd lang (no argument) — show current
  if (!targetLang) {
    console.log(t(msg.LANG_CURRENT, { lang: currentLang }));
    return;
  }

  // afd lang <en|ko> — change language
  if (!supported.includes(targetLang as SupportedLang)) {
    console.error(t(msg.LANG_INVALID, { lang: targetLang, supported: supported.join(", ") }));
    process.exit(1);
  }

  const newLang = targetLang as SupportedLang;
  writeConfig({ lang: newLang });
  setLanguageOverride(newLang);

  // Print feedback in the NEW language
  const newMsg = getMessages(newLang);
  console.log(t(newMsg.LANG_CHANGED, { lang: newLang }));
  console.log(t(newMsg.LANG_SAVED, { path: getConfigPath() }));
}
