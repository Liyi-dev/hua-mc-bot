import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpConfig } from "../config";
import { createMcpServer } from "./server";
import { startMcpHttpServer } from "./http";

export type McpTransport = "http" | "stdio" | "both";

/**
 * 根据配置启动 MCP 服务。
 * - http：Streamable HTTP，供外部 AI 项目远程调用（推荐）
 * - stdio：标准输入输出，供 Cursor 等本地 MCP 客户端挂载子进程
 * - both：同时启动 HTTP 与 stdio
 */
export async function startMcpServer(config: McpConfig): Promise<void> {
  if (!config.enabled) {
    console.log("[mcp] 已禁用（MCP_ENABLED=false）");
    return;
  }

  if (config.transport === "http" || config.transport === "both") {
    startMcpHttpServer(config);
  }

  if (config.transport === "stdio" || config.transport === "both") {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("[mcp] stdio 传输已就绪");
  }
}

export { createMcpServer } from "./server";
