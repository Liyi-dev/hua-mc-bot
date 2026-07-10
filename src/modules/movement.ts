import { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";
import { registerCommand } from "./chat";

/**
 * Check whether pathfinder is available on this bot instance.
 */
function hasPathfinder(bot: Bot): boolean {
  return !!bot.pathfinder;
}

/**
 * Register movement chat commands. `pathfinderAvailable` should reflect
 * whether the pathfinder plugin was successfully loaded at startup.
 */
export function setupMovement(bot: Bot, pathfinderAvailable: boolean): void {
  if (!pathfinderAvailable) {
    console.log("[movement] Pathfinder not available — movement commands will reply with errors");
  }

  registerCommand("come", (ctx) => {
    if (!hasPathfinder(ctx.bot)) {
      ctx.bot.chat("Pathfinder not available.");
      return;
    }

    const player = ctx.bot.players[ctx.username];
    if (!player?.entity) {
      ctx.bot.chat(`I can't see you, ${ctx.username}.`);
      return;
    }

    ctx.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    ctx.bot.chat(`Coming to you, ${ctx.username}!`);
  });

  registerCommand("follow", (ctx) => {
    if (!hasPathfinder(ctx.bot)) {
      ctx.bot.chat("Pathfinder not available.");
      return;
    }

    const targetName = ctx.args[0];
    if (!targetName) {
      ctx.bot.chat("Usage: !follow <player>");
      return;
    }

    const player = ctx.bot.players[targetName];
    if (!player?.entity) {
      ctx.bot.chat(`Can't see player: ${targetName}`);
      return;
    }

    ctx.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 3), true);
    ctx.bot.chat(`Following ${targetName}.`);
  });

  registerCommand("stop", (ctx) => {
    if (hasPathfinder(ctx.bot)) {
      ctx.bot.pathfinder.setGoal(null);
    }
    ctx.bot.clearControlStates();
    ctx.bot.chat("Stopped.");
  });

  console.log("[movement] Commands registered: !come, !follow, !stop");
}
