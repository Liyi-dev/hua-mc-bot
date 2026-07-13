import { Bot } from "mineflayer";
import {
  ATTACK_MODES,
  AttackMode,
  AttackOptions,
  attackTargets,
  getAttackStatus,
  hitTargets,
  setAttackExclude,
  stopAttack,
} from "../actions/attack-actions";
import { BotActionError } from "../actions/bot-actions";
import { registerCommand } from "./chat";

let commandsRegistered = false;

const MODE_SET = new Set<string>(ATTACK_MODES);

function parseAttackArgs(args: string[]): AttackOptions {
  if (args.length === 0) {
    throw new BotActionError(
      "用法: !hit|!attack <players|mobs|hostile|friendly|neutral|named|all> [name] [maxDistance]",
    );
  }

  const first = args[0].toLowerCase();
  let mode: AttackMode;
  let rest: string[];

  if (MODE_SET.has(first)) {
    mode = first as AttackMode;
    rest = args.slice(1);
  } else {
    // `!attack cow` → named cow
    mode = "named";
    rest = args;
  }

  let targetName: string | undefined;
  let maxDistance: number | undefined;

  if (rest.length > 0) {
    const maybeDist = Number(rest[rest.length - 1]);
    if (rest.length >= 2 && !Number.isNaN(maybeDist) && maybeDist > 0) {
      maxDistance = maybeDist;
      targetName = rest.slice(0, -1).join(" ");
    } else if (!Number.isNaN(Number(rest[0])) && rest.length === 1 && mode !== "named") {
      maxDistance = Number(rest[0]);
    } else {
      targetName = rest.join(" ");
    }
  }

  if (mode === "named" && !targetName) {
    throw new BotActionError("named 模式需要生物/玩家名，例如: !attack named cow");
  }

  // 带了名字但 mode 不是 named：仍保留 mode 约束 + 名称过滤
  const options: AttackOptions = { mode };
  if (targetName) options.targetName = targetName;
  if (maxDistance !== undefined) options.maxDistance = maxDistance;
  return options;
}

/**
 * 注册攻击类聊天指令
 */
export function setupAttack(_bot: Bot): void {
  if (!commandsRegistered) {
    registerCommand("hit", (ctx) => {
      try {
        const options = parseAttackArgs(ctx.args);
        const result = hitTargets(ctx.bot, options);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("attack", (ctx) => {
      try {
        const options = parseAttackArgs(ctx.args);
        const result = attackTargets(ctx.bot, options);
        ctx.bot.chat(result);
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    registerCommand("attackstop", (ctx) => {
      const result = stopAttack(ctx.bot);
      ctx.bot.chat(result);
    });

    registerCommand("attackstatus", (ctx) => {
      const status = getAttackStatus(ctx.bot);
      if (!status.running) {
        ctx.bot.chat(`攻击未运行 | exclude=[${status.exclude.join(",")}]`);
        return;
      }
      const target = status.currentTarget
        ? `${status.currentTarget.displayName}@${status.currentTarget.distance.toFixed(1)}m`
        : "无";
      ctx.bot.chat(
        `攻击中 mode=${status.mode} range=${status.maxDistance} target=${target} exclude=[${status.exclude.join(",")}]`,
      );
    });

    registerCommand("attackexclude", (ctx) => {
      const action = (ctx.args[0] || "list").toLowerCase();
      try {
        if (action === "list") {
          const result = setAttackExclude(ctx.bot, { action: "list" });
          ctx.bot.chat(`${result.message}: ${result.exclude.join(", ") || "(空)"}`);
          return;
        }
        if (action === "clear") {
          const result = setAttackExclude(ctx.bot, { action: "clear" });
          ctx.bot.chat(result.message);
          return;
        }
        if (action === "add" || action === "remove" || action === "set") {
          const names = ctx.args.slice(1);
          if (names.length === 0) {
            ctx.bot.chat(`用法: !attackexclude ${action} <name...>`);
            return;
          }
          const result = setAttackExclude(ctx.bot, { action, names });
          ctx.bot.chat(`${result.message} => [${result.exclude.join(", ")}]`);
          return;
        }
        ctx.bot.chat("用法: !attackexclude list|add|remove|set|clear [names...]");
      } catch (err) {
        const msg = err instanceof BotActionError ? err.message : String(err);
        ctx.bot.chat(msg);
      }
    });

    commandsRegistered = true;
    console.log("[attack] 指令注册: !hit, !attack, !attackstop, !attackstatus, !attackexclude");
  }
}
