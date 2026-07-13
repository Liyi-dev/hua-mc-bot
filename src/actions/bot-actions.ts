import { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";

type BotEntity = NonNullable<Bot["entity"]>;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BotStatus {
  username: string;
  health: number;
  food: number;
  ping: number | null;
  dimension: string;
  position: Vec3Like | null;
  ready: boolean;
}

export interface NearbyPlayer {
  username: string;
  distance: number | null;
  position: Vec3Like | null;
}

export interface NearbyMob {
  id: number;
  name: string;
  displayName: string;
  /** minecraft-data 中的实体类型，如 animal / hostile / mob */
  type: string;
  /** 分类，如 Passive mobs / Hostile mobs */
  kind: string | null;
  distance: number | null;
  position: Vec3Like;
  health: number | undefined;
}

export interface NearbyItem {
  id: number;
  name: string;
  displayName: string;
  count: number;
  distance: number | null;
  position: Vec3Like;
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

function toVec3(pos: { x: number; y: number; z: number }): Vec3Like {
  return { x: pos.x, y: pos.y, z: pos.z };
}

function distanceToSelf(bot: Bot, pos: { x: number; y: number; z: number }): number | null {
  const selfPos = bot.entity?.position;
  if (selfPos === undefined) return null;
  const dx = selfPos.x - pos.x;
  const dy = selfPos.y - pos.y;
  const dz = selfPos.z - pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isDroppedItem(entity: BotEntity): boolean {
  return entity.name === "item" || entity.name === "item_stack";
}

/** 新版 minecraft-data 不再把牛等归为 type=mob，而是 animal/hostile/passive 等 */
const MOB_ENTITY_TYPES = new Set([
  "mob",
  "animal",
  "hostile",
  "passive",
  "water_creature",
  "ambient",
  "living",
]);

function getEntityKind(entity: BotEntity): string | null {
  const kind = (entity as BotEntity & { kind?: string }).kind;
  return typeof kind === "string" && kind.length > 0 ? kind : null;
}

function isMobEntity(bot: Bot, entity: BotEntity): boolean {
  if (!entity || entity === bot.entity) return false;
  if (entity.type === "player") return false;
  if (isDroppedItem(entity)) return false;
  if (entity.type === "orb" || entity.type === "projectile") return false;
  if (entity.name === "experience_orb" || entity.name === "xp_orb") return false;

  if (entity.type && MOB_ENTITY_TYPES.has(entity.type)) {
    return true;
  }

  // 兼容：category 为 "Passive mobs" / "Hostile mobs"
  const kind = getEntityKind(entity);
  return kind !== null && /mobs/i.test(kind);
}

function getDroppedItemInfo(entity: BotEntity): { name: string; displayName: string; count: number } | null {
  const dropped = typeof entity.getDroppedItem === "function" ? entity.getDroppedItem() : null;
  if (!dropped) {
    return null;
  }
  return {
    name: dropped.name,
    displayName: dropped.displayName ?? dropped.name,
    count: dropped.count ?? 1,
  };
}

export function getBotStatus(bot: Bot): BotStatus {
  const pos = bot.entity?.position;
  return {
    username: bot.username,
    health: bot.health,
    food: bot.food,
    ping: bot.player?.ping ?? null,
    dimension: bot.game?.dimension ?? "unknown",
    position: pos ? toVec3(pos) : null,
    ready: bot.entity !== null,
  };
}

export function getNearbyPlayers(bot: Bot): NearbyPlayer[] {
  return Object.values(bot.players)
    .filter((player) => player.username !== bot.username && player.entity)
    .map((player) => {
      const pos = player.entity!.position;
      return {
        username: player.username,
        distance: distanceToSelf(bot, pos),
        position: toVec3(pos),
      };
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

/** 列出视野内附近生物及其坐标 */
export function getNearbyMobs(bot: Bot, maxDistance?: number): NearbyMob[] {
  return Object.values(bot.entities)
    .filter((entity): entity is BotEntity => !!entity && isMobEntity(bot, entity))
    .map((entity) => {
      const pos = entity.position;
      const distance = distanceToSelf(bot, pos);
      return {
        id: entity.id,
        name: entity.name ?? "unknown",
        displayName: entity.displayName ?? entity.name ?? "unknown",
        type: entity.type ?? "unknown",
        kind: getEntityKind(entity),
        distance,
        position: toVec3(pos),
        health: typeof entity.health === "number" ? entity.health : undefined,
      };
    })
    .filter((mob) => maxDistance === undefined || (mob.distance !== null && mob.distance <= maxDistance))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

/** 列出视野内附近掉落物及其坐标 */
export function getNearbyItems(bot: Bot, maxDistance?: number): NearbyItem[] {
  return Object.values(bot.entities)
    .filter((entity): entity is BotEntity => !!entity && entity !== bot.entity && isDroppedItem(entity))
    .map((entity) => {
      const info = getDroppedItemInfo(entity);
      const pos = entity.position;
      const distance = distanceToSelf(bot, pos);
      return {
        id: entity.id,
        name: info?.name ?? entity.name ?? "item",
        displayName: info?.displayName ?? entity.displayName ?? entity.name ?? "item",
        count: info?.count ?? 1,
        distance,
        position: toVec3(pos),
      };
    })
    .filter((item) => maxDistance === undefined || (item.distance !== null && item.distance <= maxDistance))
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

  clearItemTour(bot);
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

  clearItemTour(bot);
  bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 3), true);
  return `正在跟随 ${username}`;
}

function findTargetMob(bot: Bot, mobName?: string, entityId?: number): NearbyMob {
  const mobs = getNearbyMobs(bot);
  if (mobs.length === 0) {
    throw new BotActionError("附近没有可见生物");
  }

  if (entityId !== undefined) {
    const byId = mobs.find((mob) => mob.id === entityId);
    if (!byId) {
      throw new BotActionError(`附近找不到实体 ID：${entityId}`);
    }
    return byId;
  }

  const needle = mobName?.trim().toLowerCase();
  if (!needle) {
    return mobs[0];
  }

  const match = mobs.find(
    (mob) =>
      mob.name.toLowerCase() === needle ||
      mob.displayName.toLowerCase() === needle ||
      mob.name.toLowerCase().includes(needle) ||
      mob.displayName.toLowerCase().includes(needle),
  );
  if (!match) {
    throw new BotActionError(`附近找不到生物：${mobName}`);
  }
  return match;
}

/**
 * 寻路走到附近生物身边。
 * @param mobName 可选，生物英文名/显示名（如 cow）；不传则前往最近生物
 * @param entityId 可选，精确指定实体 ID（优先于 mobName）
 */
export function comeToMob(bot: Bot, mobName?: string, entityId?: number): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const target = findTargetMob(bot, mobName, entityId);
  const entity = bot.entities[target.id];
  if (!entity) {
    throw new BotActionError(`生物实体已消失：${target.displayName}`);
  }

  clearItemTour(bot);
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
  const dist = target.distance !== null ? `（约 ${target.distance.toFixed(1)} 格）` : "";
  return `正在前往 ${target.displayName}${dist}`;
}

/**
 * 持续跟随附近生物。
 * @param mobName 可选，生物英文名/显示名；不传则跟随最近生物
 * @param entityId 可选，精确指定实体 ID（优先于 mobName）
 */
export function followMob(bot: Bot, mobName?: string, entityId?: number): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const target = findTargetMob(bot, mobName, entityId);
  const entity = bot.entities[target.id];
  if (!entity) {
    throw new BotActionError(`生物实体已消失：${target.displayName}`);
  }

  clearItemTour(bot);
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 3), true);
  const dist = target.distance !== null ? `（约 ${target.distance.toFixed(1)} 格）` : "";
  return `正在跟随 ${target.displayName}${dist}`;
}

/**
 * 寻路走到附近掉落物身边。
 * @param itemName 可选，物品英文名（如 diamond）；不传则前往最近的掉落物
 */
export function comeToItem(bot: Bot, itemName?: string): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const items = getNearbyItems(bot);
  if (items.length === 0) {
    throw new BotActionError("附近没有掉落物");
  }

  const needle = itemName?.trim().toLowerCase();
  const target = needle
    ? items.find(
        (item) =>
          item.name.toLowerCase() === needle ||
          item.displayName.toLowerCase() === needle ||
          item.name.toLowerCase().includes(needle) ||
          item.displayName.toLowerCase().includes(needle),
      )
    : items[0];

  if (!target) {
    throw new BotActionError(`附近找不到物品：${itemName}`);
  }

  const entity = bot.entities[target.id];
  if (!entity) {
    throw new BotActionError(`物品实体已消失：${target.displayName}`);
  }

  clearItemTour(bot);
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 1), true);
  const dist = target.distance !== null ? `（约 ${target.distance.toFixed(1)} 格）` : "";
  return `正在前往 ${target.displayName} x${target.count}${dist}`;
}

/** 依次拾取任务的 goal_reached 回调，便于 stop 时精确卸载 */
let itemTourOnReached: (() => void) | null = null;

function clearItemTour(bot: Bot): void {
  if (itemTourOnReached) {
    bot.removeListener("goal_reached", itemTourOnReached);
    itemTourOnReached = null;
  }
}

/**
 * 依次寻路前往附近所有掉落物（按距离从近到远）。
 * 当前目标到达或消失后自动切换下一个。
 */
export function comeToAllItems(bot: Bot): string {
  if (!hasPathfinder(bot)) {
    throw new BotActionError("Pathfinder 未加载");
  }

  const queue = getNearbyItems(bot);
  if (queue.length === 0) {
    throw new BotActionError("附近没有掉落物");
  }

  clearItemTour(bot);

  const visitNext = (): void => {
    const remaining = getNearbyItems(bot);
    if (remaining.length === 0) {
      clearItemTour(bot);
      bot.pathfinder.setGoal(null);
      bot.chat("附近掉落物已全部走完。");
      return;
    }

    const next = remaining[0];
    const entity = bot.entities[next.id];
    if (!entity) {
      setImmediate(visitNext);
      return;
    }

    bot.pathfinder.setGoal(new goals.GoalFollow(entity, 1), true);
  };

  itemTourOnReached = (): void => {
    setTimeout(visitNext, 400);
  };
  bot.on("goal_reached", itemTourOnReached);
  visitNext();

  return `开始依次前往附近 ${queue.length} 个掉落物`;
}

export function stopMovement(bot: Bot): string {
  clearItemTour(bot);
  if (hasPathfinder(bot)) {
    bot.pathfinder.setGoal(null);
  }
  bot.clearControlStates();
  return "已停止移动";
}
