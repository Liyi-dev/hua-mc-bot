import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** 将文本包装为 MCP 工具返回结果 */
export function textResult(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/** 将 JSON 对象包装为 MCP 工具返回结果 */
export function jsonResult(data: unknown): CallToolResult {
  return textResult(JSON.stringify(data, null, 2));
}

/** 将错误包装为 MCP 工具返回结果 */
export function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
