import dotenv from "dotenv";

// 读取配置前先加载 .env
dotenv.config();

export interface ReconnectConfig {
  enabled: boolean;
  maxAttempts: number; // -1 表示无限重试
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface Config {
  host: string;
  port: number;
  username: string;
  auth: "mojang" | "microsoft" | "offline";
  version: string | false;
  commandPrefix: string;
  reconnect: ReconnectConfig;
  mcp: McpConfig;
}

export interface McpConfig {
  enabled: boolean;
  host: string;
  port: number;
  transport: "http" | "stdio" | "both";
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseOptionalInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

export function loadConfig(): Config {
  const auth = (process.env.MC_AUTH || "offline") as Config["auth"];
  if (!["mojang", "microsoft", "offline"].includes(auth)) {
    throw new Error(`Invalid MC_AUTH value: "${auth}". Must be "mojang", "microsoft", or "offline".`);
  }

  const version = process.env.MC_VERSION === "false" ? false : (process.env.MC_VERSION || false);

  return {
    host: process.env.MC_HOST || "localhost",
    port: parseOptionalInt(process.env.MC_PORT, 25565),
    username: requireEnv("MC_USERNAME"),
    auth,
    version,
    commandPrefix: process.env.COMMAND_PREFIX || "!",
    reconnect: {
      enabled: process.env.RECONNECT_ENABLED !== "false",
      maxAttempts: parseOptionalInt(process.env.RECONNECT_MAX_ATTEMPTS, 10),
      baseDelayMs: parseOptionalInt(process.env.RECONNECT_BASE_DELAY_MS, 1000),
      maxDelayMs: parseOptionalInt(process.env.RECONNECT_MAX_DELAY_MS, 60000),
    },
    mcp: {
      enabled: process.env.MCP_ENABLED !== "false",
      host: process.env.MCP_HOST || "127.0.0.1",
      port: parseOptionalInt(process.env.MCP_PORT, 3100),
      transport: parseMcpTransport(process.env.MCP_TRANSPORT),
    },
  };
}

function parseMcpTransport(value: string | undefined): McpConfig["transport"] {
  if (value === "stdio" || value === "both") {
    return value;
  }
  return "http";
}
