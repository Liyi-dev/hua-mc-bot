import { Bot } from "mineflayer";
import { CommandContext, CommandHandler } from "../types";

/** 全局指令注册表 — 各模块通过 registerCommand() 添加指令 */
const registry = new Map<string, CommandHandler>();

const SETUP_KEY = Symbol("chatSetup");

/**
 * 注册聊天指令。同名指令后注册的会覆盖先注册的。
 */
export function registerCommand(name: string, handler: CommandHandler): void {
  registry.set(name.toLowerCase(), handler);
}

/**
 * 去除字符串中的 Minecraft 格式代码（§x、§0-§f、§k、§l、§m、§n、§o、§r）。
 */
function stripFormatting(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

/**
 * 为 Bot 设置聊天监听器，将带前缀的消息分发给已注册的指令。
 * 同一 Bot 实例只注册一次，避免重连后重复监听。
 */
export function setupChat(bot: Bot, prefix: string): void {
  const botWithFlag = bot as Bot & { [SETUP_KEY]?: boolean };
  if (botWithFlag[SETUP_KEY]) {
    return;
  }
  botWithFlag[SETUP_KEY] = true;

  bot.on("chat", (username: string, message: string) => {
    // 忽略 Bot 自己发送的消息
    if (username === bot.username) return;

    // 解析前先去除 Minecraft 格式代码
    const clean = stripFormatting(message).trim();
    if (!clean.startsWith(prefix)) return;

    // 解析："!cmd arg1 arg2" → cmd="cmd", args=["arg1", "arg2"]
    const parts = clean.slice(prefix.length).split(/\s+/);
    const cmdName = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);

    const handler = registry.get(cmdName);
    if (!handler) {
      bot.chat(`未知指令: ${prefix}${cmdName}`);
      return;
    }

    const ctx: CommandContext = {
      bot,
      args,
      username,
      message: clean,
    };

    try {
      Promise.resolve(handler(ctx)).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        bot.chat(`Command error: ${errMsg}`);
        console.error(`[chat] 错误处理 "${clean}" from ${username}:`, err);
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      bot.chat(`Command error: ${errMsg}`);
      console.error(`[chat] 错误处理 "${clean}" from ${username}:`, err);
    }
  });

  console.log(`[chat] 正在监听命令前缀："${prefix}"`);
}
