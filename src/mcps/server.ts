import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  BotActionError,
  comeToPlayer,
  followPlayer,
  getBotStatus,
  getNearbyPlayers,
  sendChat,
  stopMovement,
} from "../actions/bot-actions";
import { isBotReady, requireBot } from "../core/bot-registry";
import { errorResult, jsonResult, textResult } from "./result";

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
      description: "列出机器人视野内可见的在线玩家及其距离",
      inputSchema: {},
    },
    async () => {
      try {
        const bot = requireBot();
        return jsonResult(getNearbyPlayers(bot));
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
    "mc_stop_movement",
    {
      description: "停止所有寻路与移动操作",
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
                "- mc_list_players：查看附近玩家",
                "- mc_send_chat：发送聊天",
                "- mc_come_to_player：走到玩家身边",
                "- mc_follow_player：跟随玩家",
                "- mc_stop_movement：停止移动",
                "",
                "操作前先调用 mc_get_status 或 mc_list_players 确认环境，再执行动作。",
              ].join("\n"),
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
