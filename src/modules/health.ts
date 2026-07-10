import { Bot } from "mineflayer";
import { getBotStatus } from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

/**
 * 注册状态查询类聊天指令（!ping、!pos、!status）
 */
export function setupHealth(bot: Bot): void {
  if (!commandsRegistered) {
    registerCommand("ping", (ctx) => {
      const ping = ctx.bot.player?.ping ?? "?";
      ctx.bot.chat(`Pong! ${ping}ms`);
    });

    registerCommand("pos", (ctx) => {
      const status = getBotStatus(ctx.bot);
      if (!status.position) {
        ctx.bot.chat("Position not available yet.");
        return;
      }
      const { x, y, z } = status.position;
      ctx.bot.chat(`X: ${x.toFixed(1)} Y: ${y.toFixed(1)} Z: ${z.toFixed(1)} (${status.dimension})`);
    });

    registerCommand("status", (ctx) => {
      const status = getBotStatus(ctx.bot);
      const hp = status.health.toFixed(0);
      const food = status.food.toFixed(0);
      const ping = status.ping ?? "?";

      let msg = `HP ${hp}/20 | Food ${food}/20 | Ping ${ping}ms | ${status.dimension}`;
      if (status.position) {
        const { x, y, z } = status.position;
        msg += ` | ${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`;
      }

      ctx.bot.chat(msg);
    });

    commandsRegistered = true;
    console.log("[health] Commands registered: !ping, !pos, !status");
  }
}
