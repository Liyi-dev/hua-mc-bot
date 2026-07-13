import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  attackTargets,
  getAttackStatus,
  hitTargets,
  setAttackExclude,
  stopAttack,
} from "../actions/attack-actions";
import {
  BotActionError,
  comeToAllItems,
  comeToItem,
  comeToMob,
  comeToPlayer,
  followMob,
  followPlayer,
  getBotStatus,
  getNearbyItems,
  getNearbyMobs,
  getNearbyPlayers,
  sendChat,
  stopMovement,
} from "../actions/bot-actions";
import {
  EQUIP_DESTINATIONS,
  chestTransfer,
  closeChest,
  equipItem,
  getChestContents,
  getInventory,
  getInventorySnapshot,
  openChest,
  setHeldItem,
  tossItem,
  unequipItem,
} from "../actions/inventory-actions";
import { isBotReady, requireBot } from "../core/bot-registry";
import { errorResult, jsonResult, textResult } from "./result";

const attackModeSchema = z
  .enum(["players", "mobs", "hostile", "friendly", "neutral", "named", "all"])
  .describe("攻击目标模式");

const equipDestinationSchema = z
  .enum(EQUIP_DESTINATIONS)
  .describe("装备槽位");

function handleToolError(err: unknown) {
  if (err instanceof BotActionError) {
    return errorResult(err.message);
  }
  const message = err instanceof Error ? err.message : String(err);
  return errorResult(message);
}

/** 在 MCP Server 上注册所有 Minecraft Bot 工具 */
export function registerBotTools(server: McpServer): void {
  server.registerTool(
    "mc_get_status",
    {
      description: "获取 Minecraft 机器人的完整状态（血量、饥饿、坐标、维度、延迟）",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        return jsonResult(getBotStatus(bot));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_get_ping",
    {
      description: "获取机器人到服务器的网络延迟（毫秒）",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        const ping = bot.player?.ping;
        if (ping === undefined) {
          return textResult("延迟暂不可用");
        }
        return textResult(`${ping}ms`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_list_players",
    {
      description: "列出机器人视野内可见的在线玩家及其距离；可按玩家名过滤",
      inputSchema: {
        playerName: z
          .string()
          .min(1)
          .optional()
          .describe("可选，玩家名；支持模糊匹配，如 Ste"),
      },
    },
    async ({ playerName }) => {
      try {
        const bot = requireBot();
        return jsonResult(getNearbyPlayers(bot, playerName));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_list_mobs",
    {
      description:
        "列出机器人视野内附近生物（含牛/猪等动物与敌对生物）的名称、类型、距离与坐标；可按名称过滤",
      inputSchema: {
        maxDistance: z
          .number()
          .positive()
          .optional()
          .describe("可选，只返回该距离（格）内的生物"),
        mobName: z
          .string()
          .min(1)
          .optional()
          .describe("可选，生物英文名或显示名，如 cow；支持模糊匹配"),
      },
    },
    async ({ maxDistance, mobName }) => {
      try {
        const bot = requireBot();
        return jsonResult(getNearbyMobs(bot, maxDistance, mobName));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_list_items",
    {
      description: "列出机器人视野内附近掉落物的名称、数量、距离与坐标；可按物品名过滤",
      inputSchema: {
        maxDistance: z
          .number()
          .positive()
          .optional()
          .describe("可选，只返回该距离（格）内的掉落物"),
        itemName: z
          .string()
          .min(1)
          .optional()
          .describe("可选，物品英文名或显示名，如 diamond；支持模糊匹配"),
      },
    },
    async ({ maxDistance, itemName }) => {
      try {
        const bot = requireBot();
        return jsonResult(getNearbyItems(bot, maxDistance, itemName));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_send_chat",
    {
      description: "在游戏内聊天栏发送消息（所有在线玩家可见）",
      inputSchema: {
        message: z.string().min(1).describe("要发送的聊天内容"),
      },
    },
    async ({ message }) => {
      try {
        const bot = requireBot();
        sendChat(bot, message);
        return textResult(`已发送：${message.trim()}`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_come_to_player",
    {
      description: "寻路走到指定玩家身边",
      inputSchema: {
        player: z.string().min(1).describe("目标玩家游戏名"),
      },
    },
    async ({ player }) => {
      try {
        const bot = requireBot();
        const result = comeToPlayer(bot, player);
        bot.chat(`Coming to you, ${player}!`);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_follow_player",
    {
      description: "持续跟随指定玩家移动",
      inputSchema: {
        player: z.string().min(1).describe("要跟随的玩家游戏名"),
      },
    },
    async ({ player }) => {
      try {
        const bot = requireBot();
        const result = followPlayer(bot, player);
        bot.chat(`Following ${player}.`);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_come_to_mob",
    {
      description:
        "寻路走到附近生物身边；可按名称（如 cow）或实体 ID 指定，都不传则前往最近生物",
      inputSchema: {
        mobName: z
          .string()
          .min(1)
          .optional()
          .describe("生物英文名或显示名，如 cow；可模糊匹配"),
        entityId: z
          .number()
          .int()
          .optional()
          .describe("可选，mc_list_mobs 返回的实体 ID，优先于 mobName"),
      },
    },
    async ({ mobName, entityId }) => {
      try {
        const bot = requireBot();
        const result = comeToMob(bot, mobName, entityId);
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_follow_mob",
    {
      description:
        "持续跟随附近生物；可按名称（如 cow）或实体 ID 指定，都不传则跟随最近生物",
      inputSchema: {
        mobName: z
          .string()
          .min(1)
          .optional()
          .describe("生物英文名或显示名，如 cow；可模糊匹配"),
        entityId: z
          .number()
          .int()
          .optional()
          .describe("可选，mc_list_mobs 返回的实体 ID，优先于 mobName"),
      },
    },
    async ({ mobName, entityId }) => {
      try {
        const bot = requireBot();
        const result = followMob(bot, mobName, entityId);
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_come_to_item",
    {
      description: "寻路走到附近指定掉落物身边；不传 itemName 则前往最近的掉落物",
      inputSchema: {
        itemName: z
          .string()
          .min(1)
          .optional()
          .describe("物品英文名或显示名，如 diamond；可模糊匹配"),
      },
    },
    async ({ itemName }) => {
      try {
        const bot = requireBot();
        const result = comeToItem(bot, itemName);
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_come_to_all_items",
    {
      description: "依次寻路前往附近所有掉落物身边（按距离从近到远）",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        const result = comeToAllItems(bot);
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_stop_movement",
    {
      description: "停止所有寻路与移动操作（不影响持续攻击）",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        const result = stopMovement(bot);
        bot.chat("Stopped.");
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_hit",
    {
      description:
        "对附近符合条件的目标单次挥砍（低血优先）。mode=named 时需提供 targetName 或 entityId",
      inputSchema: {
        mode: attackModeSchema,
        targetName: z.string().min(1).optional().describe("目标名称，可模糊匹配"),
        entityId: z.number().int().optional().describe("精确实体 ID"),
        maxDistance: z.number().positive().optional().describe("攻击范围（格），默认 48"),
      },
    },
    async ({ mode, targetName, entityId, maxDistance }) => {
      try {
        const bot = requireBot();
        const result = hitTargets(bot, { mode, targetName, entityId, maxDistance });
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_attack",
    {
      description:
        "持续攻击附近符合条件的目标（自动寻路贴近，低血优先）。用 mc_stop_attack 停止",
      inputSchema: {
        mode: attackModeSchema,
        targetName: z.string().min(1).optional().describe("目标名称，可模糊匹配"),
        entityId: z.number().int().optional().describe("精确实体 ID"),
        maxDistance: z.number().positive().optional().describe("攻击范围（格），默认 48"),
      },
    },
    async ({ mode, targetName, entityId, maxDistance }) => {
      try {
        const bot = requireBot();
        const result = attackTargets(bot, { mode, targetName, entityId, maxDistance });
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_stop_attack",
    {
      description: "停止持续攻击",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        const result = stopAttack(bot);
        bot.chat(result);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_get_attack_status",
    {
      description: "查看当前攻击状态（是否运行、模式、当前目标、排除名单）",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        return jsonResult(getAttackStatus(bot));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_attack_exclude",
    {
      description: "管理攻击排除名单（默认含 villager、wandering_trader、cat）",
      inputSchema: {
        action: z.enum(["list", "add", "remove", "set", "clear"]).describe("操作类型"),
        names: z
          .array(z.string().min(1))
          .optional()
          .describe("生物/玩家英文名列表；add/remove/set 时需要"),
      },
    },
    async ({ action, names }) => {
      try {
        const bot = requireBot();
        const result = setAttackExclude(bot, { action, names });
        return jsonResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_list_inventory",
    {
      description:
        "列出机器人自身背包（热键栏、主背包、盔甲、副手、当前手持）；与附近掉落物 mc_list_items 不同",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        return jsonResult(getInventory(bot));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_set_held",
    {
      description: "切换手持物品：指定热键栏槽位 0-8，或按物品名（先热键栏，没有则从背包装备到手）",
      inputSchema: {
        slot: z.number().int().min(0).max(8).optional().describe("热键栏槽位 0-8"),
        itemName: z.string().min(1).optional().describe("物品英文名或显示名"),
      },
    },
    async ({ slot, itemName }) => {
      try {
        const bot = requireBot();
        const result = await setHeldItem(bot, { slot, name: itemName });
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_equip",
    {
      description: "将背包中的物品装备到指定槽位（默认 hand）",
      inputSchema: {
        itemName: z.string().min(1).describe("物品英文名或显示名"),
        destination: equipDestinationSchema.optional().describe("默认 hand"),
      },
    },
    async ({ itemName, destination }) => {
      try {
        const bot = requireBot();
        const result = await equipItem(bot, { name: itemName, destination });
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_unequip",
    {
      description: "卸下指定装备槽的物品到背包",
      inputSchema: {
        destination: equipDestinationSchema.describe("要卸下的槽位"),
      },
    },
    async ({ destination }) => {
      try {
        const bot = requireBot();
        const result = await unequipItem(bot, destination);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_toss",
    {
      description: "丢弃背包中的物品（按物品名或绝对槽位）",
      inputSchema: {
        itemName: z.string().min(1).optional().describe("物品英文名或显示名"),
        slot: z.number().int().optional().describe("背包绝对槽位号"),
        count: z.number().int().positive().optional().describe("丢弃数量，默认整堆"),
      },
    },
    async ({ itemName, slot, count }) => {
      try {
        const bot = requireBot();
        const result = await tossItem(bot, { name: itemName, slot, count });
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_open_chest",
    {
      description:
        "打开附近箱子/陷阱箱/木桶；不传坐标则开最近的；需在约 4.5 格内，不会自动寻路",
      inputSchema: {
        x: z.number().optional().describe("方块 X（与 y z 一起传）"),
        y: z.number().optional().describe("方块 Y"),
        z: z.number().optional().describe("方块 Z"),
        maxDistance: z
          .number()
          .positive()
          .optional()
          .describe("搜索最近容器的最大距离，默认 6"),
      },
    },
    async ({ x, y, z, maxDistance }) => {
      try {
        const bot = requireBot();
        const result = await openChest(bot, { x, y, z, maxDistance });
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_list_chest",
    {
      description: "列出当前已打开箱子的内容；需先 mc_open_chest",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        return jsonResult(getChestContents(bot));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_chest_transfer",
    {
      description: "在已打开的箱子与背包之间转移物品：take=取出，put=放入",
      inputSchema: {
        direction: z.enum(["take", "put"]).describe("take 从箱到背包；put 从背包到箱"),
        itemName: z.string().min(1).optional().describe("物品英文名或显示名"),
        slot: z
          .number()
          .int()
          .optional()
          .describe("take 时为容器槽位；put 时为背包绝对槽位"),
        count: z.number().int().positive().optional().describe("数量，默认整堆"),
      },
    },
    async ({ direction, itemName, slot, count }) => {
      try {
        const bot = requireBot();
        const result = await chestTransfer(bot, {
          direction,
          name: itemName,
          slot,
          count,
        });
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.registerTool(
    "mc_close_chest",
    {
      description: "关闭当前打开的箱子",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        const result = await closeChest(bot);
        return textResult(result);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}

/** 注册只读资源，供 AI 读取机器人上下文 */
export function registerBotResources(server: McpServer): void {
  server.registerResource(
    "bot-status",
    "mc://bot/status",
    {
      description: "机器人当前实时状态（JSON）",
      mimeType: "application/json",
    },
    async () => {
      if (!isBotReady()) {
        return {
          contents: [
            {
              uri: "mc://bot/status",
              mimeType: "application/json",
              text: JSON.stringify({ ready: false, message: "Bot 未就绪" }),
            },
          ],
        };
      }

      const bot = requireBot();
      return {
        contents: [
          {
            uri: "mc://bot/status",
            mimeType: "application/json",
            text: JSON.stringify(getBotStatus(bot), null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "bot-nearby-mobs",
    "mc://bot/nearby-mobs",
    {
      description: "机器人附近生物列表（JSON）",
      mimeType: "application/json",
    },
    async () => {
      if (!isBotReady()) {
        return {
          contents: [
            {
              uri: "mc://bot/nearby-mobs",
              mimeType: "application/json",
              text: JSON.stringify({ ready: false, message: "Bot 未就绪" }),
            },
          ],
        };
      }

      const bot = requireBot();
      return {
        contents: [
          {
            uri: "mc://bot/nearby-mobs",
            mimeType: "application/json",
            text: JSON.stringify(getNearbyMobs(bot), null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "bot-nearby-items",
    "mc://bot/nearby-items",
    {
      description: "机器人附近掉落物列表（JSON）",
      mimeType: "application/json",
    },
    async () => {
      if (!isBotReady()) {
        return {
          contents: [
            {
              uri: "mc://bot/nearby-items",
              mimeType: "application/json",
              text: JSON.stringify({ ready: false, message: "Bot 未就绪" }),
            },
          ],
        };
      }

      const bot = requireBot();
      return {
        contents: [
          {
            uri: "mc://bot/nearby-items",
            mimeType: "application/json",
            text: JSON.stringify(getNearbyItems(bot), null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "bot-inventory",
    "mc://bot/inventory",
    {
      description: "机器人自身背包；若已打开箱子则附带 container 字段（JSON）",
      mimeType: "application/json",
    },
    async () => {
      if (!isBotReady()) {
        return {
          contents: [
            {
              uri: "mc://bot/inventory",
              mimeType: "application/json",
              text: JSON.stringify({ ready: false, message: "Bot 未就绪" }),
            },
          ],
        };
      }

      const bot = requireBot();
      return {
        contents: [
          {
            uri: "mc://bot/inventory",
            mimeType: "application/json",
            text: JSON.stringify(getInventorySnapshot(bot), null, 2),
          },
        ],
      };
    },
  );
}

/** 注册 Agent 提示词模板 */
export function registerBotPrompts(server: McpServer): void {
  server.registerPrompt(
    "minecraft-agent",
    {
      description: "Minecraft 机器人 Agent 操作指南",
      argsSchema: {
        task: z.string().optional().describe("当前要完成的任务描述"),
      },
    },
    async ({ task }) => {
      const taskLine = task ? `当前任务：${task}` : "请根据玩家需求操作机器人。";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "你是一个 Minecraft 机器人助手，通过 MCP 工具控制游戏内的 Bot。",
                taskLine,
                "",
                "可用工具：",
                "- mc_get_status：查看状态",
                "- mc_list_players：查看附近玩家（可选 playerName）",
                "- mc_list_mobs：查看附近生物及坐标（可选 mobName / maxDistance）",
                "- mc_list_items：查看附近掉落物及坐标（可选 itemName / maxDistance）",
                "- mc_list_inventory：查看自身背包/热键栏/手持/盔甲",
                "- mc_set_held：切换手持（slot 0-8 或 itemName）",
                "- mc_equip / mc_unequip：装备或卸下",
                "- mc_toss：丢弃物品",
                "- mc_open_chest / mc_list_chest / mc_chest_transfer / mc_close_chest：开箱与存取",
                "- mc_send_chat：发送聊天",
                "- mc_come_to_player：走到玩家身边",
                "- mc_follow_player：跟随玩家",
                "- mc_come_to_mob：走到指定/最近生物身边",
                "- mc_follow_mob：跟随指定/最近生物",
                "- mc_come_to_item：走到指定/最近掉落物身边",
                "- mc_come_to_all_items：依次走到附近所有掉落物身边",
                "- mc_stop_movement：停止移动（不停攻击）",
                "- mc_hit：单次挥砍（mode: players/mobs/hostile/friendly/neutral/named/all）",
                "- mc_attack：持续攻击（低血优先，可设范围）",
                "- mc_stop_attack：停止攻击",
                "- mc_get_attack_status：查看攻击状态",
                "- mc_attack_exclude：管理攻击排除名单",
                "",
                "操作前先调用 mc_get_status / mc_list_mobs / mc_list_items / mc_list_inventory 确认环境，再执行动作。",
                "开箱需在约 4.5 格内；mc_list_items 是世界掉落物，mc_list_inventory 是自身背包。",              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}

/** 创建并配置 MCP Server 实例 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "hua-mc-bot",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerBotTools(server);
  registerBotResources(server);
  registerBotPrompts(server);

  return server;
}
