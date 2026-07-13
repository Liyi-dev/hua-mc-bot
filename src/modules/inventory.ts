import { Bot } from "mineflayer";
import {
  EQUIP_DESTINATIONS,
  EquipDestination,
  chestTransfer,
  closeChest,
  equipItem,
  getChestContents,
  getInventory,
  openChest,
  setHeldItem,
  tossItem,
  unequipItem,
} from "../actions/inventory-actions";
import { BotActionError } from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

const DEST_SET = new Set<string>(EQUIP_DESTINATIONS);

function formatSlots(
  slots: { slot: number; displayName: string; count: number }[],
  limit: number,
): string {
  if (slots.length === 0) return "(空)";
  const preview = slots.slice(0, limit);
  const lines = preview.map((s) => `[${s.slot}]${s.displayName}x${s.count}`);
  const more = slots.length > preview.length ? ` ...+${slots.length - preview.length}` : "";
  return `${lines.join(" | ")}${more}`;
}

function parseOptionalCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) {
    throw new BotActionError("数量必须是正数");
  }
  return n;
}

function parseDestination(raw: string | undefined): EquipDestination {
  const dest = (raw ?? "hand").toLowerCase();
  if (!DEST_SET.has(dest)) {
    throw new BotActionError(`装备槽: ${EQUIP_DESTINATIONS.join("|")}`);
  }
  return dest as EquipDestination;
}

/**
 * 注册物品管理类聊天指令
 */
export function setupInventory(_bot: Bot): void {
  if (!commandsRegistered) {
    registerCommand("inv", (ctx) => {
      const view = getInventory(ctx.bot);
      const held = view.held
        ? `${view.held.displayName}x${view.held.count}(槽${view.quickBarSlot})`
        : `(空,槽${view.quickBarSlot})`;
      const hotbar = formatSlots(view.hotbar, 9);
      const main = formatSlots(view.main, 6);
      const armor = formatSlots(view.armor, 4);
      const off = view.offHand
        ? `${view.offHand.displayName}x${view.offHand.count}`
        : "(空)";
      ctx.bot.chat(
        `手持 ${held} | 热键 ${hotbar} | 背包 ${main} | 甲 ${armor} | 副手 ${off}`,
      );
    });

    registerCommand("hold", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError("用法: !hold <0-8|物品名>");
        }
        const first = ctx.args[0];
        const asSlot = Number(first);
        if (ctx.args.length === 1 && Number.isInteger(asSlot) && !Number.isNaN(asSlot)) {
          const result = await setHeldItem(ctx.bot, { slot: asSlot });
          ctx.bot.chat(result);
          return;
        }
        const result = await setHeldItem(ctx.bot, { name: ctx.args.join(" ") });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("equip", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError(
            "用法: !equip <物品名> [hand|head|torso|legs|feet|off-hand]",
          );
        }
        const last = ctx.args[ctx.args.length - 1].toLowerCase();
        let destination: EquipDestination = "hand";
        let nameParts = ctx.args;
        if (DEST_SET.has(last) && ctx.args.length >= 2) {
          destination = last as EquipDestination;
          nameParts = ctx.args.slice(0, -1);
        }
        const result = await equipItem(ctx.bot, {
          name: nameParts.join(" "),
          destination,
        });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("unequip", async (ctx) => {
      try {
        const destination = parseDestination(ctx.args[0]);
        const result = await unequipItem(ctx.bot, destination);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("toss", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError("用法: !toss <物品名|槽位> [数量]");
        }
        const first = ctx.args[0];
        const asSlot = Number(first);
        if (Number.isInteger(asSlot) && !Number.isNaN(asSlot) && ctx.args.length <= 2) {
          const count = parseOptionalCount(ctx.args[1]);
          const result = await tossItem(ctx.bot, { slot: asSlot, count });
          ctx.bot.chat(result);
          return;
        }
        const maybeCount = ctx.args.length >= 2 ? Number(ctx.args[ctx.args.length - 1]) : NaN;
        let name: string;
        let count: number | undefined;
        if (!Number.isNaN(maybeCount) && maybeCount > 0 && ctx.args.length >= 2) {
          count = maybeCount;
          name = ctx.args.slice(0, -1).join(" ");
        } else {
          name = ctx.args.join(" ");
        }
        const result = await tossItem(ctx.bot, { name, count });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("openchest", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          const result = await openChest(ctx.bot);
          ctx.bot.chat(result);
          return;
        }
        if (ctx.args.length !== 3) {
          throw new BotActionError("用法: !openchest [x y z]");
        }
        const x = Number(ctx.args[0]);
        const y = Number(ctx.args[1]);
        const z = Number(ctx.args[2]);
        if ([x, y, z].some((n) => Number.isNaN(n))) {
          throw new BotActionError("坐标必须是数字");
        }
        const result = await openChest(ctx.bot, { x, y, z });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("chest", (ctx) => {
      try {
        const view = getChestContents(ctx.bot);
        const slots = formatSlots(view.slots, 8);
        ctx.bot.chat(
          `${view.type}@${view.position.x},${view.position.y},${view.position.z} (${view.slots.length}): ${slots}`,
        );
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("take", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError("用法: !take <物品名|槽位> [数量]");
        }
        const first = ctx.args[0];
        const asSlot = Number(first);
        if (Number.isInteger(asSlot) && !Number.isNaN(asSlot) && ctx.args.length <= 2) {
          const count = parseOptionalCount(ctx.args[1]);
          const result = await chestTransfer(ctx.bot, {
            direction: "take",
            slot: asSlot,
            count,
          });
          ctx.bot.chat(result);
          return;
        }
        const maybeCount = ctx.args.length >= 2 ? Number(ctx.args[ctx.args.length - 1]) : NaN;
        let name: string;
        let count: number | undefined;
        if (!Number.isNaN(maybeCount) && maybeCount > 0 && ctx.args.length >= 2) {
          count = maybeCount;
          name = ctx.args.slice(0, -1).join(" ");
        } else {
          name = ctx.args.join(" ");
        }
        const result = await chestTransfer(ctx.bot, { direction: "take", name, count });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("put", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError("用法: !put <物品名|槽位> [数量]");
        }
        const first = ctx.args[0];
        const asSlot = Number(first);
        if (Number.isInteger(asSlot) && !Number.isNaN(asSlot) && ctx.args.length <= 2) {
          const count = parseOptionalCount(ctx.args[1]);
          const result = await chestTransfer(ctx.bot, {
            direction: "put",
            slot: asSlot,
            count,
          });
          ctx.bot.chat(result);
          return;
        }
        const maybeCount = ctx.args.length >= 2 ? Number(ctx.args[ctx.args.length - 1]) : NaN;
        let name: string;
        let count: number | undefined;
        if (!Number.isNaN(maybeCount) && maybeCount > 0 && ctx.args.length >= 2) {
          count = maybeCount;
          name = ctx.args.slice(0, -1).join(" ");
        } else {
          name = ctx.args.join(" ");
        }
        const result = await chestTransfer(ctx.bot, { direction: "put", name, count });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("closechest", async (ctx) => {
      try {
        const result = await closeChest(ctx.bot);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    commandsRegistered = true;
    console.log(
      "[inventory] 指令注册: !inv, !hold, !equip, !unequip, !toss, !openchest, !chest, !take, !put, !closechest",
    );
  }
}
