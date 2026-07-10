import { Bot } from "mineflayer";
import { CommandContext, CommandHandler } from "../types";

/** Global command registry — modules call registerCommand() to add commands. */
const registry = new Map<string, CommandHandler>();

/**
 * Register a chat command. Later registrations with the same name overwrite earlier ones.
 */
export function registerCommand(name: string, handler: CommandHandler): void {
  registry.set(name.toLowerCase(), handler);
}

/**
 * Strip Minecraft formatting codes (§x, §0-§f, §k, §l, §m, §n, §o, §r) from a string.
 */
function stripFormatting(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

/**
 * Set up the chat listener on the bot. Dispatches prefixed messages to registered commands.
 */
export function setupChat(bot: Bot, prefix: string): void {
  bot.on("chat", (username: string, message: string) => {
    // Ignore own messages
    if (username === bot.username) return;

    // Strip any Minecraft formatting codes before parsing
    const clean = stripFormatting(message).trim();
    if (!clean.startsWith(prefix)) return;

    // Parse: "!cmd arg1 arg2" → cmd="cmd", args=["arg1", "arg2"]
    const parts = clean.slice(prefix.length).split(/\s+/);
    const cmdName = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);

    const handler = registry.get(cmdName);
    if (!handler) {
      bot.chat(`Unknown command: ${prefix}${cmdName}`);
      return;
    }

    const ctx: CommandContext = {
      bot,
      args,
      username,
      message: clean,
    };

    try {
      handler(ctx);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      bot.chat(`Command error: ${errMsg}`);
      console.error(`[chat] Error handling "${clean}" from ${username}:`, err);
    }
  });

  console.log(`[chat] Listening for commands with prefix "${prefix}"`);
}
