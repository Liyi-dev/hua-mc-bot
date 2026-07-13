import { Bot } from "mineflayer";
import {
  BLOCK_FACES,
  BlockFace,
  digOne,
  placeOne,
  raycastBlock,
  scanNearbyBlocks,
  selectBestTool,
} from "../actions/building-actions";
import { BotActionError } from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

const FACE_SET = new Set<string>(BLOCK_FACES);

function formatByName(byName: Record<string, number>, limit: number): string {
  const entries = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "(无)";
  const preview = entries.slice(0, limit).map(([name, count]) => `${name}x${count}`);
  const more = entries.length > preview.length ? ` ...+${entries.length - preview.length}` : "";
  return `${preview.join(", ")}${more}`;
}

function parseOptionalDistance(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) {
    throw new BotActionError("距离必须是正数");
  }
  return n;
}

function parseCoords(args: string[]): { x: number; y: number; z: number } | null {
  if (args.length < 3) return null;
  const x = Number(args[0]);
  const y = Number(args[1]);
  const z = Number(args[2]);
  if ([x, y, z].some((n) => Number.isNaN(n))) return null;
  return { x, y, z };
}

/**
 * 注册建筑相关聊天指令
 */
export function setupBuilding(_bot: Bot): void {
  if (!commandsRegistered) {
    registerCommand("blocks", (ctx) => {
      try {
        let maxDistance: number | undefined;
        let name: string | undefined;
        if (ctx.args.length >= 1) {
          const asDist = Number(ctx.args[0]);
          if (!Number.isNaN(asDist) && asDist > 0) {
            maxDistance = asDist;
            name = ctx.args.slice(1).join(" ").trim() || undefined;
          } else {
            name = ctx.args.join(" ").trim() || undefined;
          }
        }
        const summary = scanNearbyBlocks(ctx.bot, {
          maxDistance,
          names: name ? [name] : undefined,
          maxResults: 8,
        });
        const nearest = summary.blocks
          .slice(0, 3)
          .map(
            (b) =>
              `${b.displayName}@${b.position.x.toFixed(0)},${b.position.y.toFixed(0)},${b.position.z.toFixed(0)}(${b.distance?.toFixed(1) ?? "?"}m)`,
          )
          .join(" | ");
        ctx.bot.chat(
          `方块 ${summary.total} | ${formatByName(summary.byName, 8)}${nearest ? ` | 近 ${nearest}` : ""}`,
        );
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("lookblock", (ctx) => {
      try {
        const maxDistance = parseOptionalDistance(ctx.args[0]);
        const block = raycastBlock(ctx.bot, maxDistance);
        const dist = block.distance !== null ? block.distance.toFixed(1) : "?";
        ctx.bot.chat(
          `准星 ${block.displayName}(${block.name}) @ ${block.position.x},${block.position.y},${block.position.z} ${dist}m mat=${block.material ?? "-"} dig=${block.diggable}`,
        );
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("toolfor", (ctx) => {
      try {
        if (ctx.args.length === 0) {
          throw new BotActionError("用法: !toolfor <方块名>");
        }
        const blockName = ctx.args.join(" ");
        const choice = selectBestTool(ctx.bot, blockName);
        if (!choice) {
          ctx.bot.chat(`背包中没有适合挖掘 ${blockName} 的工具`);
          return;
        }
        ctx.bot.chat(
          `推荐 ${choice.itemName}(槽${choice.slot}) ${choice.family}/${choice.tier ?? "-"} score=${choice.score} — ${choice.reason}`,
        );
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("dig", async (ctx) => {
      try {
        if (ctx.args.length === 0) {
          const result = await digOne(ctx.bot, {});
          ctx.bot.chat(result);
          return;
        }
        const coords = parseCoords(ctx.args);
        if (coords && ctx.args.length === 3) {
          const result = await digOne(ctx.bot, { position: coords });
          ctx.bot.chat(result);
          return;
        }
        const result = await digOne(ctx.bot, { name: ctx.args.join(" ") });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("place", async (ctx) => {
      try {
        if (ctx.args.length < 4) {
          throw new BotActionError(
            "用法: !place <物品名> <x y z> [up|down|north|south|east|west]",
          );
        }

        const maybeFace = ctx.args[ctx.args.length - 1].toLowerCase();
        const hasFace = FACE_SET.has(maybeFace);
        const face = hasFace ? (maybeFace as BlockFace) : undefined;
        const coordArgs = hasFace
          ? ctx.args.slice(ctx.args.length - 4, ctx.args.length - 1)
          : ctx.args.slice(ctx.args.length - 3);
        const nameParts = hasFace
          ? ctx.args.slice(0, ctx.args.length - 4)
          : ctx.args.slice(0, ctx.args.length - 3);

        if (nameParts.length === 0) {
          throw new BotActionError("需要物品名");
        }
        const coords = parseCoords(coordArgs);
        if (!coords) {
          throw new BotActionError("坐标无效，用法: !place <物品名> <x y z> [face]");
        }

        const itemName = nameParts.join(" ");
        const result = face
          ? await placeOne(ctx.bot, { against: coords, face, itemName })
          : await placeOne(ctx.bot, { target: coords, itemName });
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    commandsRegistered = true;
  }
}
