import { Bot } from "mineflayer";
import { goals } from "mineflayer-pathfinder";
import { Block } from "prismarine-block";
import { Item } from "prismarine-item";
import { Vec3 } from "vec3";
import { BotActionError } from "./bot-actions";
import { setHeldItem } from "./inventory-actions";

const DEFAULT_SCAN_DISTANCE = 8;
const DEFAULT_SCAN_MAX_RESULTS = 64;
const DEFAULT_RAYCAST_DISTANCE = 5;
const REACH = 4.5;
const APPROACH_TIMEOUT_MS = 60_000;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BlockView {
  name: string;
  displayName: string;
  position: Vec3Like;
  distance: number | null;
  hardness: number | null;
  material: string | null;
  diggable: boolean;
}

export interface BlockScanOptions {
  maxDistance?: number;
  names?: string[];
  maxResults?: number;
  includeAir?: boolean;
}

export interface BlockScanSummary {
  total: number;
  byName: Record<string, number>;
  blocks: BlockView[];
}

export type ToolFamily = "pickaxe" | "axe" | "shovel" | "hoe" | "shears" | "sword" | "hand";
export type ToolTier = "wood" | "stone" | "iron" | "gold" | "diamond" | "netherite";

export interface ToolChoice {
  itemName: string;
  slot: number;
  family: ToolFamily;
  tier: ToolTier | null;
  score: number;
  reason: string;
}

export interface DigOneOptions {
  position?: Vec3Like;
  name?: string;
  maxDistance?: number;
  autoTool?: boolean;
  force?: boolean;
}

export type BlockFace = "up" | "down" | "north" | "south" | "east" | "west";

export const BLOCK_FACES: BlockFace[] = ["up", "down", "north", "south", "east", "west"];

export interface PlaceOneOptions {
  /** 要填入的空气格（主路径） */
  target?: Vec3Like;
  /** 参照固体方块 */
  against?: Vec3Like;
  face?: BlockFace;
  itemName?: string;
}

const FACE_VECTORS: Record<BlockFace, Vec3> = {
  up: new Vec3(0, 1, 0),
  down: new Vec3(0, -1, 0),
  north: new Vec3(0, 0, -1),
  south: new Vec3(0, 0, 1),
  west: new Vec3(-1, 0, 0),
  east: new Vec3(1, 0, 0),
};

const MATERIAL_TO_FAMILY: Record<string, ToolFamily> = {
  rock: "pickaxe",
  wood: "axe",
  plant: "axe",
  melon: "axe",
  leaves: "shears",
  dirt: "shovel",
  web: "sword",
  wool: "shears",
};

const TIER_SCORE: Record<ToolTier, number> = {
  wood: 1,
  gold: 2,
  stone: 3,
  iron: 4,
  diamond: 5,
  netherite: 6,
};

const FAMILY_SCORE_BONUS = 100;

// ---------------------------------------------------------------------------
// L0 knowledge
// ---------------------------------------------------------------------------

function normalizeQuery(name: string): string {
  return name.trim().toLowerCase();
}

function nameMatches(candidate: string, query: string): boolean {
  const c = candidate.toLowerCase();
  const q = normalizeQuery(query);
  return c === q || c.includes(q);
}

function parseToolFamily(itemName: string): ToolFamily | null {
  const n = itemName.toLowerCase();
  if (n.includes("pickaxe")) return "pickaxe";
  if (n.includes("_axe") || n.endsWith("axe") || n === "axe") return "axe";
  if (n.includes("shovel")) return "shovel";
  if (n.includes("hoe")) return "hoe";
  if (n.includes("shears")) return "shears";
  if (n.includes("sword")) return "sword";
  return null;
}

function parseToolTier(itemName: string): ToolTier | null {
  const n = itemName.toLowerCase();
  if (n.startsWith("wooden_") || n.startsWith("wood_")) return "wood";
  if (n.startsWith("stone_")) return "stone";
  if (n.startsWith("iron_")) return "iron";
  if (n.startsWith("golden_") || n.startsWith("gold_")) return "gold";
  if (n.startsWith("diamond_")) return "diamond";
  if (n.startsWith("netherite_")) return "netherite";
  return null;
}

interface BlockHarvestInfo {
  name: string;
  displayName: string;
  material: string | null;
  hardness: number | null;
  diggable: boolean;
  harvestTools?: { [k: string]: boolean };
  preferredFamily: ToolFamily;
}

function resolveBlockInfo(bot: Bot, blockName: string): BlockHarvestInfo {
  const q = normalizeQuery(blockName);
  const byName = bot.registry.blocksByName as Record<
    string,
    {
      name: string;
      displayName: string;
      hardness: number | null;
      diggable: boolean;
      material?: string | null;
      harvestTools?: { [k: string]: boolean };
    }
  >;

  let def = byName[q];
  if (!def) {
    const key = Object.keys(byName).find((k) => nameMatches(k, q) || nameMatches(byName[k].displayName, q));
    if (key) def = byName[key];
  }
  if (!def) {
    throw new BotActionError(`未知方块: ${blockName}`);
  }

  const material = def.material ?? null;
  const preferredFamily = (material && MATERIAL_TO_FAMILY[material]) || "hand";

  return {
    name: def.name,
    displayName: def.displayName,
    material,
    hardness: def.hardness ?? null,
    diggable: def.diggable,
    harvestTools: def.harvestTools,
    preferredFamily,
  };
}

function canHarvestWithTools(
  harvestTools: { [k: string]: boolean } | undefined,
  itemType: number | null,
): boolean {
  if (!harvestTools) return true;
  if (itemType === null) return false;
  return !!harvestTools[String(itemType)];
}

function rankToolAgainstBlock(item: Item, info: BlockHarvestInfo): number {
  const family = parseToolFamily(item.name) ?? "hand";
  const tier = parseToolTier(item.name);
  let score = tier ? TIER_SCORE[tier] : 0;

  if (family === info.preferredFamily) {
    score += FAMILY_SCORE_BONUS;
  } else if (family !== "hand") {
    score += 10;
  }

  if (!canHarvestWithTools(info.harvestTools, item.type)) {
    return -1;
  }

  return score;
}

// ---------------------------------------------------------------------------
// L1 sense
// ---------------------------------------------------------------------------

function toVec3Like(pos: { x: number; y: number; z: number }): Vec3Like {
  return { x: pos.x, y: pos.y, z: pos.z };
}

function distanceToSelf(bot: Bot, pos: { x: number; y: number; z: number }): number | null {
  const selfPos = bot.entity?.position;
  if (!selfPos) return null;
  return selfPos.distanceTo(new Vec3(pos.x, pos.y, pos.z));
}

function blockToView(bot: Bot, block: Block): BlockView {
  const center = block.position.offset(0.5, 0.5, 0.5);
  return {
    name: block.name,
    displayName: block.displayName,
    position: toVec3Like(block.position),
    distance: distanceToSelf(bot, center),
    hardness: block.hardness ?? null,
    material: block.material ?? null,
    diggable: block.diggable,
  };
}

function isAirLike(block: Block | null): boolean {
  if (!block) return true;
  return block.boundingBox === "empty" || block.name === "air" || block.name === "cave_air" || block.name === "void_air";
}

function isSolidBlock(block: Block | null): block is Block {
  return !!block && block.boundingBox === "block";
}

/** 读取指定坐标方块视图 */
export function getBlockAt(bot: Bot, pos: Vec3Like): BlockView | null {
  const block = bot.blockAt(new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)));
  if (!block) return null;
  return blockToView(bot, block);
}

/** 扫描附近方块分布 */
export function scanNearbyBlocks(bot: Bot, options: BlockScanOptions = {}): BlockScanSummary {
  const maxDistance = options.maxDistance ?? DEFAULT_SCAN_DISTANCE;
  const maxResults = options.maxResults ?? DEFAULT_SCAN_MAX_RESULTS;
  const includeAir = options.includeAir ?? false;
  const nameFilters = options.names?.map(normalizeQuery).filter(Boolean);

  if (!bot.entity?.position) {
    throw new BotActionError("机器人尚未就绪");
  }

  const positions = bot.findBlocks({
    matching: (block) => {
      if (!block) return false;
      if (!includeAir && isAirLike(block)) return false;
      if (nameFilters && nameFilters.length > 0) {
        return nameFilters.some(
          (q) => nameMatches(block.name, q) || nameMatches(block.displayName, q),
        );
      }
      return true;
    },
    maxDistance,
    count: Math.max(maxResults * 4, maxResults),
  });

  const byName: Record<string, number> = {};
  const blocks: BlockView[] = [];

  for (const pos of positions) {
    const block = bot.blockAt(pos);
    if (!block) continue;
    byName[block.name] = (byName[block.name] ?? 0) + 1;
    if (blocks.length < maxResults) {
      blocks.push(blockToView(bot, block));
    }
  }

  blocks.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  return {
    total: positions.length,
    byName,
    blocks,
  };
}

/** 准星前方方块 */
export function raycastBlock(bot: Bot, maxDistance = DEFAULT_RAYCAST_DISTANCE): BlockView {
  const block = bot.blockAtCursor(maxDistance);
  if (!block || isAirLike(block)) {
    throw new BotActionError("准星前方没有方块");
  }
  return blockToView(bot, block);
}

// ---------------------------------------------------------------------------
// L2 decide
// ---------------------------------------------------------------------------

/** 只读：为指定方块选择背包中最佳工具；无可用工具返回 null */
export function selectBestTool(bot: Bot, blockName: string): ToolChoice | null {
  const info = resolveBlockInfo(bot, blockName);
  const items = bot.inventory.items();
  let best: ToolChoice | null = null;

  for (const item of items) {
    const score = rankToolAgainstBlock(item, info);
    if (score < 0) continue;
    const family = parseToolFamily(item.name) ?? "hand";
    const tier = parseToolTier(item.name);
    const reason =
      family === info.preferredFamily
        ? `最佳${family}`
        : canHarvestWithTools(info.harvestTools, item.type)
          ? "可收获工具"
          : "次优工具";

    const choice: ToolChoice = {
      itemName: item.name,
      slot: item.slot,
      family,
      tier,
      score,
      reason,
    };
    if (!best || choice.score > best.score) {
      best = choice;
    }
  }

  return best;
}

async function ensureToolEquipped(bot: Bot, block: Block, force: boolean): Promise<string | null> {
  const choice = selectBestTool(bot, block.name);
  if (choice) {
    await setHeldItem(bot, { name: choice.itemName });
    return choice.itemName;
  }

  const heldType = bot.heldItem?.type ?? null;
  if (block.canHarvest(heldType)) {
    return bot.heldItem?.name ?? null;
  }

  if (force) {
    return bot.heldItem?.name ?? null;
  }

  if (block.harvestTools) {
    throw new BotActionError(`没有合适的工具挖掘 ${block.displayName}`);
  }

  return null;
}

function findPlaceableItem(bot: Bot, preferredName?: string): Item {
  const items = bot.inventory.items();
  const blocksByName = bot.registry.blocksByName as Record<string, unknown>;

  const isPlaceable = (item: Item): boolean => {
    if (blocksByName[item.name]) return true;
    // 部分版本物品与方块同名表分离，仍允许尝试常见可放置物品
    return item.stackSize > 0 && !parseToolFamily(item.name);
  };

  if (preferredName) {
    const q = normalizeQuery(preferredName);
    const match =
      items.find((i) => i.name.toLowerCase() === q) ??
      items.find((i) => nameMatches(i.name, q) || nameMatches(i.displayName, q));
    if (!match) {
      throw new BotActionError(`背包中找不到物品: ${preferredName}`);
    }
    return match;
  }

  if (bot.heldItem && isPlaceable(bot.heldItem)) {
    return bot.heldItem;
  }

  const placeable = items.find(isPlaceable);
  if (!placeable) {
    throw new BotActionError("背包中没有可放置的方块");
  }
  return placeable;
}

// ---------------------------------------------------------------------------
// L3 atomic helpers
// ---------------------------------------------------------------------------

function hasPathfinder(bot: Bot): boolean {
  return !!bot.pathfinder;
}

function formatPos(pos: Vec3Like): string {
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new BotActionError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function approachForDig(bot: Bot, block: Block): Promise<void> {
  if (bot.canDigBlock(block)) return;
  if (!hasPathfinder(bot)) {
    throw new BotActionError(`方块太远且 Pathfinder 未加载: ${block.displayName}`);
  }
  try {
    await withTimeout(
      bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world, { reach: REACH })),
      APPROACH_TIMEOUT_MS,
      `靠近方块超时: ${block.displayName}`,
    );
  } catch (err) {
    if (err instanceof BotActionError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BotActionError(`无法靠近方块 ${block.displayName}: ${msg}`);
  }
  if (!bot.canDigBlock(block)) {
    throw new BotActionError(`仍无法触及方块: ${block.displayName} @ ${formatPos(block.position)}`);
  }
}

async function approachForPlace(bot: Bot, reference: Block): Promise<void> {
  const center = reference.position.offset(0.5, 0.5, 0.5);
  const dist = distanceToSelf(bot, center);
  if (dist !== null && dist <= REACH) return;
  if (!hasPathfinder(bot)) {
    throw new BotActionError(`参照方块太远且 Pathfinder 未加载: ${formatPos(reference.position)}`);
  }
  try {
    await withTimeout(
      bot.pathfinder.goto(
        new goals.GoalNear(reference.position.x, reference.position.y, reference.position.z, Math.floor(REACH - 1)),
      ),
      APPROACH_TIMEOUT_MS,
      `靠近放置位置超时: ${formatPos(reference.position)}`,
    );
  } catch (err) {
    if (err instanceof BotActionError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BotActionError(`无法靠近放置位置: ${msg}`);
  }
}

function resolveDigTarget(bot: Bot, options: DigOneOptions): Block {
  if (options.position && options.name) {
    throw new BotActionError("dig 不能同时指定 position 与 name");
  }

  if (options.position) {
    const pos = new Vec3(
      Math.floor(options.position.x),
      Math.floor(options.position.y),
      Math.floor(options.position.z),
    );
    const block = bot.blockAt(pos);
    if (!block || isAirLike(block)) {
      throw new BotActionError(`目标位置没有可挖方块: ${formatPos(pos)}`);
    }
    return block;
  }

  if (options.name) {
    const maxDistance = options.maxDistance ?? DEFAULT_SCAN_DISTANCE;
    const q = normalizeQuery(options.name);
    const found = bot.findBlock({
      matching: (block) =>
        !!block && !isAirLike(block) && (nameMatches(block.name, q) || nameMatches(block.displayName, q)),
      maxDistance,
    });
    if (!found) {
      throw new BotActionError(`附近找不到方块: ${options.name}`);
    }
    return found;
  }

  const cursor = bot.blockAtCursor(DEFAULT_RAYCAST_DISTANCE);
  if (!cursor || isAirLike(cursor)) {
    throw new BotActionError("未指定目标，且准星前方没有方块");
  }
  return cursor;
}

function resolvePlaceRefs(
  bot: Bot,
  options: PlaceOneOptions,
): { reference: Block; faceVector: Vec3; targetPos: Vec3 } {
  if (options.target && (options.against || options.face)) {
    throw new BotActionError("place 请使用 target，或 against+face，不要混用");
  }

  if (options.against) {
    if (!options.face) {
      throw new BotActionError("指定 against 时必须提供 face");
    }
    const againstPos = new Vec3(
      Math.floor(options.against.x),
      Math.floor(options.against.y),
      Math.floor(options.against.z),
    );
    const reference = bot.blockAt(againstPos);
    if (!isSolidBlock(reference)) {
      throw new BotActionError(`参照位置不是固体方块: ${formatPos(againstPos)}`);
    }
    const faceVector = FACE_VECTORS[options.face];
    const targetPos = againstPos.plus(faceVector);
    const targetBlock = bot.blockAt(targetPos);
    if (targetBlock && !isAirLike(targetBlock)) {
      throw new BotActionError(`目标格已被占用: ${formatPos(targetPos)} (${targetBlock.name})`);
    }
    return { reference, faceVector, targetPos };
  }

  if (!options.target) {
    throw new BotActionError("需要提供 target 或 against+face");
  }

  const targetPos = new Vec3(
    Math.floor(options.target.x),
    Math.floor(options.target.y),
    Math.floor(options.target.z),
  );
  const existing = bot.blockAt(targetPos);
  if (existing && !isAirLike(existing)) {
    throw new BotActionError(`目标格已被占用: ${formatPos(targetPos)} (${existing.name})`);
  }

  for (const face of BLOCK_FACES) {
    const faceVector = FACE_VECTORS[face];
    const againstPos = targetPos.minus(faceVector);
    const reference = bot.blockAt(againstPos);
    if (isSolidBlock(reference)) {
      return { reference, faceVector, targetPos };
    }
  }

  throw new BotActionError(`目标格 ${formatPos(targetPos)} 周围没有可依附的固体方块`);
}

/** 挖掘一块方块（可自动走近并换工具） */
export async function digOne(bot: Bot, options: DigOneOptions = {}): Promise<string> {
  const autoTool = options.autoTool ?? true;
  const force = options.force ?? false;
  const block = resolveDigTarget(bot, options);

  if (!block.diggable) {
    throw new BotActionError(`方块不可挖掘: ${block.displayName}`);
  }

  await approachForDig(bot, block);

  if (autoTool) {
    await ensureToolEquipped(bot, block, force);
  } else if (!force && !block.canHarvest(bot.heldItem?.type ?? null)) {
    throw new BotActionError(`当前手持无法收获 ${block.displayName}，请换工具或开启 autoTool`);
  }

  const label = `${block.displayName} @ ${formatPos(block.position)}`;
  try {
    await bot.dig(block);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BotActionError(`挖掘失败 ${label}: ${msg}`);
  }

  const after = bot.blockAt(block.position);
  if (after && !isAirLike(after) && after.type === block.type) {
    throw new BotActionError(`挖掘后方块仍在: ${label}`);
  }

  return `已挖掘 ${label}`;
}

/** 放置一块方块（可自动走近并切换材料） */
export async function placeOne(bot: Bot, options: PlaceOneOptions): Promise<string> {
  const { reference, faceVector, targetPos } = resolvePlaceRefs(bot, options);
  const item = findPlaceableItem(bot, options.itemName);

  if (!bot.heldItem || bot.heldItem.name !== item.name) {
    await setHeldItem(bot, { name: item.name });
  }

  await approachForPlace(bot, reference);

  try {
    await bot.placeBlock(reference, faceVector);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BotActionError(`放置失败 @ ${formatPos(targetPos)}: ${msg}`);
  }

  const placed = bot.blockAt(targetPos);
  if (!placed || isAirLike(placed)) {
    throw new BotActionError(`放置后目标格仍为空: ${formatPos(targetPos)}`);
  }

  return `已放置 ${placed.displayName} @ ${formatPos(targetPos)}`;
}
