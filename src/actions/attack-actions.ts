import { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";
import { BotActionError, stopMovement } from "./bot-actions";

type BotEntity = NonNullable<Bot["entity"]>;

export type AttackMode =
  | "players"
  | "mobs"
  | "hostile"
  | "friendly"
  | "neutral"
  | "named"
  | "all";

export type EntityCombatClass = "player" | "hostile" | "friendly" | "neutral" | "other";

export interface AttackOptions {
  mode: AttackMode;
  targetName?: string;
  entityId?: number;
  maxDistance?: number;
  /** 本次请求额外排除的名称（与全局排除名单合并） */
  exclude?: string[];
}

export interface AttackTargetInfo {
  id: number;
  name: string;
  displayName: string;
  combatClass: EntityCombatClass;
  distance: number;
  health: number | undefined;
  position: { x: number; y: number; z: number };
}

export interface AttackStatus {
  running: boolean;
  mode: AttackMode | null;
  targetName: string | null;
  entityId: number | null;
  maxDistance: number;
  exclude: string[];
  currentTarget: AttackTargetInfo | null;
}

export type ExcludeAction = "list" | "add" | "remove" | "set" | "clear";

const DEFAULT_MAX_DISTANCE = 48;
const ATTACK_TICK_MS = 450;
const MELEE_RANGE = 3.5;

/** 游戏语义上的中立生物（minecraft-data 分类不准确，使用白名单） */
const NEUTRAL_MOB_NAMES = new Set([
  "wolf",
  "spider",
  "cave_spider",
  "enderman",
  "piglin",
  "zombified_piglin",
  "zombie_pigman",
  "iron_golem",
  "polar_bear",
  "bee",
  "llama",
  "trader_llama",
  "panda",
  "dolphin",
  "goat",
]);

const DEFAULT_EXCLUDE = ["villager", "wandering_trader", "cat"];

const MOB_ENTITY_TYPES = new Set([
  "mob",
  "animal",
  "hostile",
  "passive",
  "water_creature",
  "ambient",
  "living",
]);

interface AttackState {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  options: AttackOptions | null;
  currentTarget: AttackTargetInfo | null;
  exclude: Set<string>;
}

const state: AttackState = {
  running: false,
  timer: null,
  options: null,
  currentTarget: null,
  exclude: new Set(DEFAULT_EXCLUDE),
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function distanceToSelf(bot: Bot, pos: { x: number; y: number; z: number }): number | null {
  const selfPos = bot.entity?.position;
  if (selfPos === undefined) return null;
  const dx = selfPos.x - pos.x;
  const dy = selfPos.y - pos.y;
  const dz = selfPos.z - pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getEntityKind(entity: BotEntity): string | null {
  const kind = (entity as BotEntity & { kind?: string }).kind;
  return typeof kind === "string" && kind.length > 0 ? kind : null;
}

function isDroppedItem(entity: BotEntity): boolean {
  return entity.name === "item" || entity.name === "item_stack";
}

function isMobEntity(bot: Bot, entity: BotEntity): boolean {
  if (!entity || entity === bot.entity) return false;
  if (entity.type === "player") return false;
  if (isDroppedItem(entity)) return false;
  if (entity.type === "orb" || entity.type === "projectile") return false;
  if (entity.name === "experience_orb" || entity.name === "xp_orb") return false;
  if (entity.type && MOB_ENTITY_TYPES.has(entity.type)) return true;
  const kind = getEntityKind(entity);
  return kind !== null && /mobs/i.test(kind);
}

function classifyEntity(bot: Bot, entity: BotEntity): EntityCombatClass {
  if (entity.type === "player") return "player";
  if (!isMobEntity(bot, entity)) return "other";

  const name = normalizeName(entity.name ?? "");
  if (NEUTRAL_MOB_NAMES.has(name)) return "neutral";

  if (entity.type === "hostile" || /hostile/i.test(getEntityKind(entity) ?? "")) {
    return "hostile";
  }
  return "friendly";
}

function entityDisplayName(entity: BotEntity): string {
  if (entity.type === "player") {
    return entity.username ?? entity.displayName ?? entity.name ?? "player";
  }
  return entity.displayName ?? entity.name ?? "unknown";
}

function entityNameKey(entity: BotEntity): string {
  if (entity.type === "player") {
    return normalizeName(entity.username ?? entity.name ?? "player");
  }
  return normalizeName(entity.name ?? "unknown");
}

function matchesName(entity: BotEntity, needle: string): boolean {
  const n = normalizeName(needle);
  const keys = [
    entity.name,
    entity.displayName,
    entity.username,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  return keys.some((key) => {
    const k = normalizeName(key);
    return k === n || k.includes(n);
  });
}

function resolveMaxDistance(options: AttackOptions): number {
  return options.maxDistance !== undefined && options.maxDistance > 0
    ? options.maxDistance
    : DEFAULT_MAX_DISTANCE;
}

function buildExcludeSet(options?: AttackOptions): Set<string> {
  const set = new Set(state.exclude);
  for (const name of options?.exclude ?? []) {
    const n = normalizeName(name);
    if (n) set.add(n);
  }
  return set;
}

function toTargetInfo(bot: Bot, entity: BotEntity, distance: number): AttackTargetInfo {
  return {
    id: entity.id,
    name: entityNameKey(entity),
    displayName: entityDisplayName(entity),
    combatClass: classifyEntity(bot, entity),
    distance,
    health: typeof entity.health === "number" ? entity.health : undefined,
    position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
  };
}

function collectCandidates(bot: Bot, options: AttackOptions): AttackTargetInfo[] {
  if (!bot.entity) {
    throw new BotActionError("Bot 实体尚未就绪");
  }

  const maxDistance = resolveMaxDistance(options);
  const exclude = buildExcludeSet(options);
  const mode = options.mode;
  const needle = options.targetName?.trim();
  const entityId = options.entityId;

  if (mode === "named" && !needle && entityId === undefined) {
    throw new BotActionError("named 模式需要提供 targetName 或 entityId");
  }

  const results: AttackTargetInfo[] = [];

  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;

    const combatClass = classifyEntity(bot, entity);
    if (combatClass === "other") continue;

    const nameKey = entityNameKey(entity);
    if (exclude.has(nameKey)) continue;
    // 玩家也按用户名排除
    if (entity.type === "player" && entity.username && exclude.has(normalizeName(entity.username))) {
      continue;
    }

    const distance = distanceToSelf(bot, entity.position);
    if (distance === null || distance > maxDistance) continue;

    if (entityId !== undefined && entity.id !== entityId) continue;

    if (needle && !matchesName(entity, needle)) continue;

    // 无名称/ID 时按 mode 过滤；有 needle 或 entityId 时已匹配则放行（仍受 mode 约束）
    if (!needle && entityId === undefined) {
      switch (mode) {
        case "players":
          if (combatClass !== "player") continue;
          break;
        case "mobs":
          if (combatClass === "player") continue;
          break;
        case "hostile":
          if (combatClass !== "hostile") continue;
          break;
        case "friendly":
          if (combatClass !== "friendly") continue;
          break;
        case "neutral":
          if (combatClass !== "neutral") continue;
          break;
        case "all":
          break;
        case "named":
          // 已在上方校验必须有 name/id
          break;
      }
    } else if (mode !== "named" && mode !== "all") {
      // 指定了名称但仍带 mode 时，名称匹配 + mode 约束
      switch (mode) {
        case "players":
          if (combatClass !== "player") continue;
          break;
        case "mobs":
          if (combatClass === "player") continue;
          break;
        case "hostile":
          if (combatClass !== "hostile") continue;
          break;
        case "friendly":
          if (combatClass !== "friendly") continue;
          break;
        case "neutral":
          if (combatClass !== "neutral") continue;
          break;
      }
    }

    results.push(toTargetInfo(bot, entity, distance));
  }

  results.sort((a, b) => {
    const ah = a.health;
    const bh = b.health;
    const aUnknown = ah === undefined;
    const bUnknown = bh === undefined;
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    if (!aUnknown && !bUnknown && ah !== bh) return ah - bh;
    return a.distance - b.distance;
  });

  return results;
}

function pickTarget(bot: Bot, options: AttackOptions): AttackTargetInfo | null {
  const list = collectCandidates(bot, options);
  return list[0] ?? null;
}

/** 生成更明确的“找不到目标”原因，便于排查范围/名称问题 */
function describeNoTarget(bot: Bot, options: AttackOptions): string {
  const maxDistance = resolveMaxDistance(options);
  const needle = options.targetName?.trim();
  const exclude = buildExcludeSet(options);

  let visibleCombat = 0;
  const nameHits: { displayName: string; distance: number; excluded: boolean }[] = [];

  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity) continue;
    const combatClass = classifyEntity(bot, entity);
    if (combatClass === "other") continue;
    visibleCombat += 1;

    const distance = distanceToSelf(bot, entity.position);
    if (distance === null) continue;

    if (needle && matchesName(entity, needle)) {
      const nameKey = entityNameKey(entity);
      const excluded =
        exclude.has(nameKey) ||
        (entity.type === "player" &&
          !!entity.username &&
          exclude.has(normalizeName(entity.username)));
      nameHits.push({
        displayName: entityDisplayName(entity),
        distance,
        excluded,
      });
    }
  }

  nameHits.sort((a, b) => a.distance - b.distance);

  if (needle && nameHits.length > 0) {
    const nearest = nameHits[0];
    if (nearest.excluded) {
      return `附近没有符合条件的攻击目标：「${nearest.displayName}」在排除名单中`;
    }
    if (nearest.distance > maxDistance) {
      return `附近没有符合条件的攻击目标：最近的「${nearest.displayName}」约 ${nearest.distance.toFixed(1)} 格，超出范围 ${maxDistance}（可增大 maxDistance）`;
    }
  }

  if (needle) {
    return `附近没有符合条件的攻击目标：视野内未找到「${needle}」（可见战斗实体 ${visibleCombat} 个，范围 ≤${maxDistance}）`;
  }

  return `附近没有符合条件的攻击目标（可见战斗实体 ${visibleCombat} 个，范围 ≤${maxDistance}）`;
}

function swingAt(bot: Bot, entity: BotEntity): void {
  const eye = entity.position.offset(0, entity.height ? entity.height * 0.85 : 1.2, 0);
  bot.lookAt(eye, true);
  bot.attack(entity);
}

function validateOptions(options: AttackOptions): AttackOptions {
  const mode = options.mode;
  const valid: AttackMode[] = ["players", "mobs", "hostile", "friendly", "neutral", "named", "all"];
  if (!valid.includes(mode)) {
    throw new BotActionError(`未知攻击模式：${mode}`);
  }
  if (mode === "named" && !options.targetName?.trim() && options.entityId === undefined) {
    throw new BotActionError("named 模式需要提供 targetName 或 entityId");
  }
  return options;
}

/** 单次挥砍：选中目标打一刀 */
export function hitTargets(bot: Bot, options: AttackOptions): string {
  const opts = validateOptions(options);
  const target = pickTarget(bot, opts);
  if (!target) {
    throw new BotActionError(describeNoTarget(bot, opts));
  }

  const entity = bot.entities[target.id];
  if (!entity) {
    throw new BotActionError(`目标已消失：${target.displayName}`);
  }

  swingAt(bot, entity);
  const hp = target.health !== undefined ? ` HP=${target.health.toFixed(1)}` : "";
  return `已攻击 ${target.displayName}（${target.combatClass}，${target.distance.toFixed(1)}m${hp}）`;
}

function clearAttackTimer(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function attackTick(bot: Bot): void {
  if (!state.running || !state.options) return;

  const target = pickTarget(bot, state.options);
  state.currentTarget = target;

  if (!target) {
    if (bot.pathfinder) {
      bot.pathfinder.setGoal(null);
    }
    return;
  }

  const entity = bot.entities[target.id];
  if (!entity) {
    state.currentTarget = null;
    return;
  }

  if (bot.pathfinder) {
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
  }

  if (target.distance <= MELEE_RANGE) {
    swingAt(bot, entity);
  }
}

/** 持续战斗：循环寻路 + 近战攻击 */
export function attackTargets(bot: Bot, options: AttackOptions): string {
  const opts = validateOptions(options);

  // 清掉物品巡回等移动任务，避免抢 pathfinder
  stopMovement(bot);
  stopAttack(bot);

  const preview = pickTarget(bot, opts);
  state.running = true;
  state.options = opts;
  state.currentTarget = preview;
  state.timer = setInterval(() => {
    try {
      attackTick(bot);
    } catch (err) {
      console.error("[attack] tick error:", err);
    }
  }, ATTACK_TICK_MS);

  // 立即执行一次
  attackTick(bot);

  const maxDistance = resolveMaxDistance(opts);
  if (preview) {
    return `开始持续攻击（mode=${opts.mode}，范围=${maxDistance}），当前目标 ${preview.displayName}`;
  }
  return `开始持续攻击（mode=${opts.mode}，范围=${maxDistance}），附近暂无目标，等待中`;
}

export function stopAttack(bot: Bot): string {
  const wasRunning = state.running;
  clearAttackTimer();
  state.running = false;
  state.options = null;
  state.currentTarget = null;

  if (bot.pathfinder) {
    bot.pathfinder.setGoal(null);
  }

  return wasRunning ? "已停止攻击" : "当前没有进行中的攻击";
}

export function getAttackStatus(_bot: Bot): AttackStatus {
  return {
    running: state.running,
    mode: state.options?.mode ?? null,
    targetName: state.options?.targetName ?? null,
    entityId: state.options?.entityId ?? null,
    maxDistance: state.options ? resolveMaxDistance(state.options) : DEFAULT_MAX_DISTANCE,
    exclude: [...state.exclude].sort(),
    currentTarget: state.currentTarget,
  };
}

export function setAttackExclude(
  _bot: Bot,
  params: { action: ExcludeAction; names?: string[] },
): { exclude: string[]; message: string } {
  const action = params.action;
  const names = (params.names ?? []).map(normalizeName).filter(Boolean);

  switch (action) {
    case "list":
      return { exclude: [...state.exclude].sort(), message: `排除名单共 ${state.exclude.size} 项` };
    case "clear":
      state.exclude.clear();
      return { exclude: [], message: "已清空排除名单" };
    case "set":
      state.exclude = new Set(names);
      return { exclude: [...state.exclude].sort(), message: `已设置排除名单（${state.exclude.size} 项）` };
    case "add":
      if (names.length === 0) {
        throw new BotActionError("add 需要提供 names");
      }
      for (const n of names) state.exclude.add(n);
      return { exclude: [...state.exclude].sort(), message: `已添加：${names.join(", ")}` };
    case "remove":
      if (names.length === 0) {
        throw new BotActionError("remove 需要提供 names");
      }
      for (const n of names) state.exclude.delete(n);
      return { exclude: [...state.exclude].sort(), message: `已移除：${names.join(", ")}` };
    default:
      throw new BotActionError(`未知 exclude action：${action}`);
  }
}

export const ATTACK_MODES: AttackMode[] = [
  "players",
  "mobs",
  "hostile",
  "friendly",
  "neutral",
  "named",
  "all",
];
