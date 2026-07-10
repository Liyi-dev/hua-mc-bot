import { Bot } from "mineflayer";
import {
  BotActionError,
  comeToPlayer,
  followPlayer,
  stopMovement,
} from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

/**
 * 注册移动类聊天指令。`pathfinderAvailable` 表示启动时
 * pathfinder 插件是否已成功加载。
 */
export function setupMovement(bot: Bot, pathfinderAvailable: boolean): void {
  if (!pathfinderAvailable) {
    console.log("[movement] Pathfinder not available — movement commands will reply with errors");
  }

  if (!commandsRegistered) {
    registerCommand("come", (ctx) => {
      try {
        comeToPlayer(ctx.bot, ctx.username);
        ctx.bot.chat(`Coming to you, ${ctx.username}!`);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : "Pathfinder not available.";
        ctx.bot.chat(msg);
      }
    });

    registerCommand("follow", (ctx) => {
      const targetName = ctx.args[0];
      if (!targetName) {
        ctx.bot.chat("Usage: !follow <player>");
        return;
      }

      try {
        followPlayer(ctx.bot, targetName);
        ctx.bot.chat(`Following ${targetName}.`);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : `Can't see player: ${targetName}`;
        ctx.bot.chat(msg);
      }
    });

    registerCommand("stop", (ctx) => {
      stopMovement(ctx.bot);
      ctx.bot.chat("Stopped.");
    });

    commandsRegistered = true;
    console.log("[movement] Commands registered: !come, !follow, !stop");
  }
}
