import { Bot, Chest, EquipmentDestination } from "mineflayer";
import { Block } from "prismarine-block";
import { Item } from "prismarine-item";
import { Vec3 } from "vec3";
import { BotActionError } from "./bot-actions";

export interface InvSlot {
  slot: number;
  name: string;
  displayName: string;
  count: number;
}

export interface InventoryView {
  held: InvSlot | null;
  hotbar: InvSlot[];
  main: InvSlot[];
  armor: InvSlot[];
  offHand: InvSlot | null;
  quickBarSlot: number;
}

export interface ContainerView {
  type: string;
  position: { x: number; y: number; z: number };
  slots: InvSlot[];
}

export interface InventoryWithContainer {
  inventory: InventoryView;
  container: ContainerView | null;
}

export type EquipDestination = EquipmentDestination;

export const EQUIP_DESTINATIONS = [
  "hand",
  "head",
  "torso",
  "legs",
  "feet",
  "off-hand",
] as const;

const CONTAINER_NAMES = new Set(["chest", "trapped_chest", "barrel"]);
const DEFAULT_FIND_DISTANCE = 6;
const OPEN_REACH = 4.5;

interface OpenContainerState {
  chest: Chest;
  type: string;
  position: { x: number; y: number; z: number };
}

let currentContainer: OpenContainerState | null = null;

function toInvSlot(item: Item): InvSlot {
  return {
    slot: item.slot,
    name: item.name,
    displayName: item.displayName,
    count: item.count,
  };
}

function itemMatches(item: Item, query: string): boolean {
  const q = query.toLowerCase();
  if (item.name.toLowerCase() === q) return true;
  if (item.displayName.toLowerCase() === q) return true;
  return item.displayName.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
}

function findItemByName(items: Item[], name: string): Item | null {
  const exact = items.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const displayExact = items.find(
    (item) => item.displayName.toLowerCase() === name.toLowerCase(),
  );
  if (displayExact) return displayExact;
  return items.find((item) => itemMatches(item, name)) ?? null;
}

function requireItemByName(items: Item[], name: string, where: string): Item {
  const item = findItemByName(items, name);
  if (!item) {
    throw new BotActionError(`${where}中找不到物品: ${name}`);
  }
  return item;
}

function formatPos(pos: { x: number; y: number; z: number }): string {
  return `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`;
}

function isContainerBlock(block: Block | null): block is Block {
  return !!block && CONTAINER_NAMES.has(block.name);
}

function distanceToBlock(bot: Bot, block: Block): number | null {
  const selfPos = bot.entity?.position;
  if (!selfPos) return null;
  return selfPos.distanceTo(block.position.offset(0.5, 0.5, 0.5));
}

function clearContainerState(): void {
  currentContainer = null;
}

function requireOpenChest(): OpenContainerState {
  if (!currentContainer) {
    throw new BotActionError("当前没有打开的箱子，请先 openchest");
  }
  return currentContainer;
}

/** 读取自身背包视图 */
export function getInventory(bot: Bot): InventoryView {
  const inv = bot.inventory;
  const hotbar: InvSlot[] = [];
  for (let i = 0; i < 9; i++) {
    const item = inv.slots[inv.hotbarStart + i];
    if (item) hotbar.push(toInvSlot(item));
  }

  const main: InvSlot[] = [];
  for (let i = inv.inventoryStart; i < inv.hotbarStart; i++) {
    const item = inv.slots[i];
    if (item) main.push(toInvSlot(item));
  }

  const armor: InvSlot[] = [];
  for (const dest of ["head", "torso", "legs", "feet"] as const) {
    const slot = bot.getEquipmentDestSlot(dest);
    const item = inv.slots[slot];
    if (item) armor.push(toInvSlot(item));
  }

  const offHandSlot = bot.getEquipmentDestSlot("off-hand");
  const offHandItem = inv.slots[offHandSlot];

  return {
    held: bot.heldItem ? toInvSlot(bot.heldItem) : null,
    hotbar,
    main,
    armor,
    offHand: offHandItem ? toInvSlot(offHandItem) : null,
    quickBarSlot: bot.quickBarSlot,
  };
}

/** 背包视图；若已开箱则附带容器内容 */
export function getInventorySnapshot(bot: Bot): InventoryWithContainer {
  return {
    inventory: getInventory(bot),
    container: currentContainer ? getChestContents(bot) : null,
  };
}

export interface SetHeldOptions {
  slot?: number;
  name?: string;
}

/** 切换手持：优先热键栏槽位；按名先找热键栏，没有则 equip 到 hand */
export async function setHeldItem(bot: Bot, options: SetHeldOptions): Promise<string> {
  const { slot, name } = options;
  if (slot === undefined && !name) {
    throw new BotActionError("需要提供 slot(0-8) 或 name");
  }

  if (slot !== undefined) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) {
      throw new BotActionError("热键栏槽位必须是 0-8 的整数");
    }
    bot.setQuickBarSlot(slot);
    const held = bot.heldItem;
    return held
      ? `已切换到手持槽 ${slot}: ${held.displayName} x${held.count}`
      : `已切换到热键栏槽 ${slot}（空）`;
  }

  const query = name!;
  const inv = bot.inventory;
  for (let i = 0; i < 9; i++) {
    const item = inv.slots[inv.hotbarStart + i];
    if (item && itemMatches(item, query)) {
      bot.setQuickBarSlot(i);
      return `已切换到手持槽 ${i}: ${item.displayName} x${item.count}`;
    }
  }

  const item = requireItemByName(inv.items(), query, "背包");
  await bot.equip(item, "hand");
  return `已装备到手持: ${item.displayName} x${item.count}`;
}

export interface EquipOptions {
  name: string;
  destination?: EquipDestination;
}

export async function equipItem(bot: Bot, options: EquipOptions): Promise<string> {
  const destination = options.destination ?? "hand";
  if (!EQUIP_DESTINATIONS.includes(destination)) {
    throw new BotActionError(`无效装备槽: ${destination}`);
  }
  const item = requireItemByName(bot.inventory.items(), options.name, "背包");
  await bot.equip(item, destination);
  return `已装备 ${item.displayName} 到 ${destination}`;
}

export async function unequipItem(
  bot: Bot,
  destination: EquipDestination,
): Promise<string> {
  if (!EQUIP_DESTINATIONS.includes(destination)) {
    throw new BotActionError(`无效装备槽: ${destination}`);
  }
  await bot.unequip(destination);
  return `已卸下 ${destination}`;
}

export interface TossOptions {
  name?: string;
  slot?: number;
  count?: number;
}

export async function tossItem(bot: Bot, options: TossOptions): Promise<string> {
  const { name, slot, count } = options;
  if (slot === undefined && !name) {
    throw new BotActionError("需要提供 name 或 slot");
  }

  let item: Item | null = null;
  if (slot !== undefined) {
    item = bot.inventory.slots[slot] ?? null;
    if (!item) {
      throw new BotActionError(`槽位 ${slot} 为空`);
    }
  } else {
    item = requireItemByName(bot.inventory.items(), name!, "背包");
  }

  const tossCount = count ?? item.count;
  if (tossCount <= 0) {
    throw new BotActionError("丢弃数量必须大于 0");
  }
  if (tossCount >= item.count) {
    await bot.tossStack(item);
    return `已丢弃 ${item.displayName} x${item.count}`;
  }

  await bot.toss(item.type, item.metadata, tossCount);
  return `已丢弃 ${item.displayName} x${tossCount}`;
}

export interface OpenChestOptions {
  x?: number;
  y?: number;
  z?: number;
  maxDistance?: number;
}

async function closeCurrentIfAny(): Promise<void> {
  if (!currentContainer) return;
  try {
    currentContainer.chest.close();
  } catch {
    // 窗口可能已关闭
  }
  clearContainerState();
}

function resolveContainerBlock(bot: Bot, options: OpenChestOptions): Block {
  const { x, y, z, maxDistance = DEFAULT_FIND_DISTANCE } = options;

  if (x !== undefined || y !== undefined || z !== undefined) {
    if (x === undefined || y === undefined || z === undefined) {
      throw new BotActionError("坐标需要同时提供 x y z");
    }
    const pos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    const block = bot.blockAt(pos);
    if (!isContainerBlock(block)) {
      throw new BotActionError(
        `坐标 ${pos.x},${pos.y},${pos.z} 不是可打开的箱子/木桶`,
      );
    }
    return block;
  }

  const block = bot.findBlock({
    matching: (b) => CONTAINER_NAMES.has(b.name),
    maxDistance,
  });
  if (!isContainerBlock(block)) {
    throw new BotActionError(`附近 ${maxDistance} 格内没有箱子或木桶`);
  }
  return block;
}

/** 打开箱子：默认最近容器，可选坐标；过远不自动寻路 */
export async function openChest(bot: Bot, options: OpenChestOptions = {}): Promise<string> {
  const block = resolveContainerBlock(bot, options);
  const dist = distanceToBlock(bot, block);
  if (dist !== null && dist > OPEN_REACH) {
    throw new BotActionError(
      `箱子太远 (${dist.toFixed(1)}m @ ${formatPos(block.position)})，请先靠近到 ${OPEN_REACH} 格内`,
    );
  }

  await closeCurrentIfAny();
  await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
  const opened = await bot.openContainer(block);
  if (typeof (opened as Chest).withdraw !== "function") {
    try {
      opened.close();
    } catch {
      // ignore
    }
    throw new BotActionError(`无法作为箱子操作: ${block.name}`);
  }

  const chest = opened as Chest;
  currentContainer = {
    chest,
    type: block.name,
    position: { x: block.position.x, y: block.position.y, z: block.position.z },
  };

  chest.once("close", () => {
    if (currentContainer?.chest === chest) {
      clearContainerState();
    }
  });

  const count = chest.containerItems().length;
  return `已打开 ${block.name} @ ${formatPos(block.position)}，容器内 ${count} 堆物品`;
}

/** 当前打开箱子的内容 */
export function getChestContents(_bot: Bot): ContainerView {
  const state = requireOpenChest();
  const slots = state.chest
    .containerItems()
    .map((item) => toInvSlot(item));
  return {
    type: state.type,
    position: state.position,
    slots,
  };
}

export type ChestTransferDirection = "take" | "put";

export interface ChestTransferOptions {
  direction: ChestTransferDirection;
  name?: string;
  slot?: number;
  count?: number;
}

function resolveContainerItem(chest: Chest, options: { name?: string; slot?: number }): Item {
  const { name, slot } = options;
  if (slot !== undefined) {
    if (slot < 0 || slot >= chest.inventoryStart) {
      throw new BotActionError(`容器槽位无效: ${slot}（有效 0-${chest.inventoryStart - 1}）`);
    }
    const item = chest.slots[slot];
    if (!item) {
      throw new BotActionError(`容器槽位 ${slot} 为空`);
    }
    return item;
  }
  if (!name) {
    throw new BotActionError("需要提供 name 或 slot");
  }
  return requireItemByName(chest.containerItems(), name, "箱子");
}

function resolvePlayerItemForDeposit(
  bot: Bot,
  options: { name?: string; slot?: number },
): Item {
  const { name, slot } = options;
  if (slot !== undefined) {
    const item = bot.inventory.slots[slot];
    if (!item) {
      throw new BotActionError(`背包槽位 ${slot} 为空`);
    }
    return item;
  }
  if (!name) {
    throw new BotActionError("需要提供 name 或 slot");
  }
  return requireItemByName(bot.inventory.items(), name, "背包");
}

/** 箱子 ↔ 背包转移 */
export async function chestTransfer(
  bot: Bot,
  options: ChestTransferOptions,
): Promise<string> {
  const state = requireOpenChest();
  const { direction, count } = options;

  if (direction === "take") {
    const item = resolveContainerItem(state.chest, options);
    const n = count ?? item.count;
    if (n <= 0) throw new BotActionError("数量必须大于 0");
    await state.chest.withdraw(item.type, item.metadata, n);
    return `已从箱子取出 ${item.displayName} x${n}`;
  }

  if (direction === "put") {
    const item = resolvePlayerItemForDeposit(bot, options);
    const n = count ?? item.count;
    if (n <= 0) throw new BotActionError("数量必须大于 0");
    await state.chest.deposit(item.type, item.metadata, n);
    return `已放入箱子 ${item.displayName} x${n}`;
  }

  throw new BotActionError(`无效方向: ${direction as string}`);
}

export async function closeChest(_bot: Bot): Promise<string> {
  if (!currentContainer) {
    return "当前没有打开的箱子";
  }
  const pos = formatPos(currentContainer.position);
  try {
    currentContainer.chest.close();
  } catch {
    // ignore
  }
  clearContainerState();
  return `已关闭箱子 @ ${pos}`;
}

/** 是否有打开的容器（供资源/状态用） */
export function hasOpenChest(): boolean {
  return currentContainer !== null;
}
