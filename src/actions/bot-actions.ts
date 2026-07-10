import { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";

export interface BotStatus {
  username: string;
  health: number;
  food: number;
  ping: number | null;
  dimension: string;
  position: { x: number; y: number; z: number } | null;
  ready: boolean;
}

export interface NearbyPlayer {
  username: string;
  distance: number | null;
  position: { x: number; y: number; z: number } | null;
}

export class BotActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotActionError";
  }
}

function hasPathfinder(bot: Bot): boolean {
  return !!bot.pathfinder;
}

export function getBotStatus(bot: Bot): BotStatus {
  const pos = bot.entity?.position;
  return {
    username: bot.username,
    health: bot.health,
    food: bot.food,
    ping: bot.player?.ping ?? null,
    dimension: bot.game?.dimension ?? "unknown",
    position: pos
      ? { x: pos.x, y: pos.y, z: pos.z }
      : null,
    ready: bot.entity !== null,
  };
}

export function getNearbyPlayers(bot: Bot): NearbyPlayer[] {
  const selfPos = bot.entity?.position;
  return Object.values(bot.players)
    .filter((player) => player.username !== bot.username && player.entity)
    .map((player) => {
      const pos = player.entity!.position;
      const distance =
        selfPos !== undefined
          ? selfPos.distanceTo(pos)
          : null;
      return {
        username: player.username,
        distance,
        position: { x: pos.x, y: pos.y, z: pos.z },
      };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export function sendChat(bot: Bot, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new BotActionError("消息不能为空");
  }
  bot.chat(trimmed);
}

export function comeToPlayer(bot: Bot, username: string): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const player = bot.players[username];
  if (!player?.entity) {
    throw new BotActionError(`看不到玩家：${username}`);
  }

  bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
  return `正在前往 ${username} 身边`;
}

export function followPlayer(bot: Bot, username: string): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const player = bot.players[username];
  if (!player?.entity) {
    throw new BotActionError(`看不到玩家：${username}`);
  }

  bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 3), true);
  return `正在跟随 ${username}`;
}

export function stopMovement(bot: Bot): string {
  if (hasPathfinder(bot)) {
    bot.pathfinder.setGoal(null);
  }
  bot.clearControlStates();
  return "已停止移动";
}
