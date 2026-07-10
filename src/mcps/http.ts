import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { McpConfig } from "../config";
import { createMcpServer } from "./server";

/**
 * 启动 Streamable HTTP MCP 服务，供外部 AI 项目远程调用。
 * 采用无状态模式：每个 HTTP 请求独立会话，Bot 状态通过 bot-registry 共享。
 */
export function startMcpHttpServer(config: McpConfig): void {
  const app = createMcpExpressApp({ host: config.host });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer();

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (err) {
      console.error("[mcp] 请求处理失败:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "hua-mc-bot-mcp" });
  });

  app.listen(config.port, config.host, () => {
    console.log(`[mcp] HTTP 服务已启动 — http://${config.host}:${config.port}/mcp`);
  });
}
