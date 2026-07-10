import dotenv from "dotenv";

// Load .env before reading config values
dotenv.config();

export interface ReconnectConfig {
  enabled: boolean;
  maxAttempts: number; // -1 = infinite
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
  };
}
