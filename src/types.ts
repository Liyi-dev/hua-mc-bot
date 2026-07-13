import { Bot } from "mineflayer";

export interface CommandContext {
  bot: Bot;
  args: string[];
  username: string;
  message: string;
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;
