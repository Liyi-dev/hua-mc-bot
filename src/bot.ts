import mineflayer, { Bot } from "mineflayer";
import { Config } from "./config";
import { clearBot, setBot } from "./core/bot-registry";
import { setupChat } from "./modules/chat";
import { setupHealth } from "./modules/health";
import { setupMovement } from "./modules/movement";

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * 创建一个 Mineflayer 机器人
 * 包含自动重连逻辑
 */
export function createBot(config: Config): Promise<Bot> {
  // 静态引入 — pathfinder 是 package.json 中的必需依赖
  const pathfinderPlugin = require("mineflayer-pathfinder").pathfinder;

  return new Promise((resolve) => {
    let attempt = 0;
    let intentionalDisconnect = false;
    let currentBot: Bot | null = null;
    let resolved = false;

    // 只注册一次进程信号处理器（放在 connect 外，避免重复注册）
    const shutdown = () => {
      intentionalDisconnect = true;
      log("Shutting down...");
      if (currentBot) {
        currentBot.quit("disconnect.quitting");
      }
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    const connect = (): void => {
      log(`Connecting to ${config.host}:${config.port} as "${config.username}"...`);

      const bot = mineflayer.createBot({
        host: config.host,
        port: config.port,
        username: config.username,
        auth: config.auth,
        version: config.version || undefined,
      });
      currentBot = bot;

      // 加载 pathfinder 插件
      bot.loadPlugin(pathfinderPlugin);
      log("Pathfinder plugin loaded.");

      // --- 生命周期日志 ---
      bot.on("login", () => {
        log(`Logged in as ${bot.username}`);
      });

      bot.on("spawn", () => {
        attempt = 0; // 连接成功后重置重试计数
        setBot(bot);
        log("Spawned — bot is ready.");

        // spawn 后再初始化模块，确保 bot.entity 等属性可用
        setupChat(bot, config.commandPrefix);
        setupHealth(bot);
        setupMovement(bot, true);

        if (!resolved) {
          resolved = true;
          resolve(bot);
        }
      });

      bot.on("kicked", (reason: string) => {
        log(`Kicked: ${reason}`);
      });

      bot.on("error", (err: Error) => {
        log(`Error: ${err.message}`);
      });

      bot.on("end", (reason: string) => {
        clearBot();
        log(`Disconnected: ${reason}`);

        if (intentionalDisconnect) {
          log("Intentional disconnect — not reconnecting.");
          return;
        }

        if (!config.reconnect.enabled) {
          log("Reconnect disabled — exiting.");
          return;
        }

        if (config.reconnect.maxAttempts !== -1 && attempt >= config.reconnect.maxAttempts) {
          log(`Max reconnect attempts (${config.reconnect.maxAttempts}) reached. Giving up.`);
          return;
        }

        const delay = Math.min(
          config.reconnect.baseDelayMs * Math.pow(2, attempt),
          config.reconnect.maxDelayMs,
        );
        attempt++;
        log(`Reconnecting in ${delay}ms (attempt ${attempt})...`);
        setTimeout(connect, delay);
      });
    };

    connect();
  });
}
