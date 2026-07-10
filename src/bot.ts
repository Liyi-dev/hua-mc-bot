import mineflayer, { Bot } from "mineflayer";
import { Config } from "./config";
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
  // 静态引入 — pathfinder is a required dependency in package.json
  const pathfinderPlugin = require("mineflayer-pathfinder").pathfinder;

  return new Promise((resolve) => {
    let attempt = 0;
    let intentionalDisconnect = false;
    let currentBot: Bot | null = null;

    // Register process signal handlers once (outside connect to avoid duplicates)
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

      // Load pathfinder plugin
      bot.loadPlugin(pathfinderPlugin);
      log("Pathfinder plugin loaded.");

      // --- Lifecycle logging ---
      bot.on("login", () => {
        log(`Logged in as ${bot.username}`);
      });

      bot.once("spawn", () => {
        attempt = 0; // reset on successful connection
        log("Spawned — bot is ready.");

        // Set up modules after spawn so bot.entity etc. are available
        setupChat(bot, config.commandPrefix);
        setupHealth(bot);
        setupMovement(bot, true);

        resolve(bot);
      });

      bot.on("kicked", (reason: string) => {
        log(`Kicked: ${reason}`);
      });

      bot.on("error", (err: Error) => {
        log(`Error: ${err.message}`);
      });

      bot.on("end", (reason: string) => {
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
