import { loadConfig } from "./config";
import { createBot } from "./bot";
import { startMcpServer } from "./mcps";

async function main(): Promise<void> {
  console.log("=== Hua MC Bot ===");

  const config = loadConfig();
  console.log(`配置加载 — server: ${config.host}:${config.port}, auth: ${config.auth}`);

  // MCP 与 Bot 并行启动；工具调用会等待 bot-registry 就绪
  await startMcpServer(config.mcp);

  const bot = await createBot(config);
  console.log(`=============== Robot is OK！！！ UserName: ${bot.username} ===============`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
