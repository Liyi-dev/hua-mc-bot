import { Bot } from "mineflayer";
import { registerCommand } from "./chat";

/**
 * Register health/status chat commands.
 */
export function setupHealth(bot: Bot): void {
  registerCommand("ping", (ctx) => {
    const ping = ctx.bot.player?.ping ?? "?";
    ctx.bot.chat(`Pong! ${ping}ms`);
  });

  registerCommand("pos", (ctx) => {
    const pos = ctx.bot.entity?.position;
    if (!pos) {
      ctx.bot.chat("Position not available yet.");
      return;
    }
    const dim = ctx.bot.game?.dimension ?? "unknown";
    ctx.bot.chat(
      `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)} (${dim})`,
    );
  });

  registerCommand("status", (ctx) => {
    const hp = ctx.bot.health.toFixed(0);
    const food = ctx.bot.food.toFixed(0);
    const ping = ctx.bot.player?.ping ?? "?";
    const dim = ctx.bot.game?.dimension ?? "unknown";
    const pos = ctx.bot.entity?.position;

    let msg = `HP ${hp}/20 | Food ${food}/20 | Ping ${ping}ms | ${dim}`;
    if (pos) {
      msg += ` | ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
    }

    ctx.bot.chat(msg);
  });

  console.log("[health] Commands registered: !ping, !pos, !status");
}
