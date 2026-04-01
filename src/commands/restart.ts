import { stopCommand } from "./stop";
import { startCommand } from "./start";
import { getSystemLanguage } from "../core/locale";
import { getMessages } from "../core/i18n/messages";

export async function restartCommand() {
  const lang = getSystemLanguage();
  const msg = getMessages(lang);

  console.log(msg.DAEMON_RESTARTING);

  await stopCommand();
  await startCommand();
}
