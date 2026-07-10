import { loadConfig } from "./config";
import { createBot } from "./bot";

async function main(): Promise<void> {
  console.log("=== Hua MC Bot ===");

  const config = loadConfig();
  console.log(`配置加载 — server: ${config.host}:${config.port}, auth: ${config.auth}`);

  const bot = await createBot(config);
  console.log(`=============== Robot is OK！！！ UserName: ${bot.username} ===============`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
