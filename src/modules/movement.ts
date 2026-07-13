import { Bot } from "mineflayer";
import {
  BotActionError,
  comeToAllItems,
  comeToItem,
  comeToMob,
  comeToPlayer,
  followMob,
  followPlayer,
  getNearbyItems,
  stopMovement,
} from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

function formatCoord(pos: { x: number; y: number; z: number }): string {
  return `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`;
}

/**
 * 注册移动类聊天指令。`pathfinderAvailable` 表示启动时
 * pathfinder 插件是否已成功加载。
 */
export function setupMovement(bot: Bot, pathfinderAvailable: boolean): void {
  if (!pathfinderAvailable) {
    console.log("[movement] 路径规划器不可用一一移动指令将返回错误信息");
  }

  if (!commandsRegistered) {
    registerCommand("come", (ctx) => {
      try {
        comeToPlayer(ctx.bot, ctx.username);
        ctx.bot.chat(`我来了, ${ctx.username}!`);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "路径查找器不可用.";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("follow", (ctx) => {
      const targetName = ctx.args[0];
      if (!targetName) {
        ctx.bot.chat("用法: !follow <player>");
        return;
      }

      try {
        followPlayer(ctx.bot, targetName);
        ctx.bot.chat(`跟随 ${targetName}.`);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : `我看不见${targetName}`;
        ctx.bot.chat(msg);
      }
    });

    registerCommand("gotomob", (ctx) => {
      const mobName = ctx.args[0];
      try {
        const result = comeToMob(ctx.bot, mobName);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "路径查找器不可用。";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("followmob", (ctx) => {
      const mobName = ctx.args[0];
      try {
        const result = followMob(ctx.bot, mobName);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "路径查找器不可用。";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("items", (ctx) => {
      const maxDistance = ctx.args[0] ? Number(ctx.args[0]) : undefined;
      if (ctx.args[0] && Number.isNaN(maxDistance)) {
        ctx.bot.chat("用法: !items [maxDistance]");
        return;
      }

      const items = getNearbyItems(ctx.bot, maxDistance);
      if (items.length === 0) {
        ctx.bot.chat("附近没有可见掉落物。");
        return;
      }

      const preview = items.slice(0, 8);
      const lines = preview.map((item) => {
        const dist = item.distance !== null ? `${item.distance.toFixed(1)}m` : "?m";
        return `${item.displayName}x${item.count}@${formatCoord(item.position)}(${dist})`;
      });
      const more = items.length > preview.length ? ` ...+${items.length - preview.length}` : "";
      ctx.bot.chat(`Items(${items.length}): ${lines.join(" | ")}${more}`);
    });

    registerCommand("getitem", (ctx) => {
      const itemName = ctx.args[0];
      try {
        const result = comeToItem(ctx.bot, itemName);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "路径查找器不可用。";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("getitems", (ctx) => {
      try {
        const result = comeToAllItems(ctx.bot);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "路径查找器不可用。";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("stop", (ctx) => {
      stopMovement(ctx.bot);
      ctx.bot.chat("停下。");
    });

    commandsRegistered = true;
    console.log("[movement] 指令注册: !come, !follow, !gotomob, !followmob, !items, !getitem, !getitems, !stop");
  }
}
