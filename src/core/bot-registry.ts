import { Bot } from "mineflayer";

let currentBot: Bot | null = null;

/** 更新当前活跃的 Bot 实例（每次 spawn / 重连后调用） */
export function setBot(bot: Bot): void {
  currentBot = bot;
}

/** 断线时清除 Bot 引用 */
export function clearBot(): void {
  currentBot = null;
}

/** 获取当前 Bot，未就绪时抛出错误 */
export function requireBot(): Bot {
  if (!currentBot) {
    throw new Error("Bot 未连接，请等待机器人上线");
  }
  if (!currentBot.entity) {
    throw new Error("Bot 尚未 spawn，请稍后再试");
  }
  return currentBot;
}

/** Bot 是否已 spawn 并可执行操作 */
export function isBotReady(): boolean {
  return currentBot !== null && currentBot.entity !== null;
}

/** 获取 Bot 引用（可能为 null） */
export function getBot(): Bot | null {
  return currentBot;
}
