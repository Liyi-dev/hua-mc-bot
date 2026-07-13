import { Bot } from "mineflayer";
import { getBotStatus, getNearbyMobs } from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

function formatCoord(pos: { x: number; y: number; z: number }): string {
  return `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`;
}

/**
 * 注册状态查询类聊天指令（!ping、!pos、!status、!mobs）
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
      const mobs = getNearbyMobs(ctx.bot);
      const hp = status.health.toFixed(0);
      const food = status.food.toFixed(0);
      const ping = status.ping ?? "?";

      let msg = `HP ${hp}/20 | Food ${food}/20 | Ping ${ping}ms | ${status.dimension}`;
      if (status.position) {
        const { x, y, z } = status.position;
        msg += ` | ${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`;
      }
      msg += ` | Mobs ${mobs.length}`;

      ctx.bot.chat(msg);
    });

    registerCommand("mobs", (ctx) => {
      const maxDistance = ctx.args[0] ? Number(ctx.args[0]) : undefined;
      if (ctx.args[0] && Number.isNaN(maxDistance)) {
        ctx.bot.chat("示例: !mobs [maxDistance]");
        return;
      }

      const mobs = getNearbyMobs(ctx.bot, maxDistance);
      if (mobs.length === 0) {
        ctx.bot.chat("附近没有可见生物。");
        return;
      }

      // 聊天有长度限制，最多汇报前 8 个
      const preview = mobs.slice(0, 8);
      const lines = preview.map((mob) => {
        const dist = mob.distance !== null ? `${mob.distance.toFixed(1)}m` : "?m";
        return `${mob.displayName}@${formatCoord(mob.position)}(${dist})`;
      });
      const more = mobs.length > preview.length ? ` ...+${mobs.length - preview.length}` : "";
      ctx.bot.chat(`生物(${mobs.length}): ${lines.join(" | ")}${more}`);
    });

    commandsRegistered = true;
    console.log("[health] 指令注册: !ping, !pos, !status, !mobs");
  }
}
