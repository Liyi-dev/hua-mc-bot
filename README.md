# Hua MC Bot

基于 [Mineflayer](https://github.com/PrismarineJS/mineflayer) 的 Minecraft Bot MVP 项目，使用 TypeScript 构建。

## 功能

- 登录 Minecraft 服务器（支持 offline / mojang / microsoft 认证）
- 断线自动重连（指数退避）
- 聊天指令响应
- 自身状态查询（血量、饥饿度、坐标、延迟）
- 寻路移动（来找我、跟随玩家、停止）
- 模块化结构，方便扩展

## 快速开始

### 环境要求

- Node.js >= 20
- npm

### 安装与运行

```bash
# 1. 克隆 / 进入项目目录
cd hua-mc-bot

# 2. 安装依赖
npm install

# 3. 配置 .env
cp .env.example .env
# 编辑 .env，填写服务器地址、Bot 名称等

# 4. 开发模式运行（支持热重载）
npm run dev

# 5. 或编译后运行
npm run build
npm start
```

## 配置说明

编辑 `.env` 文件，所有可用变量如下：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `MC_HOST` | `localhost` | 服务器地址 |
| `MC_PORT` | `25565` | 服务器端口 |
| `MC_USERNAME` | —（必填） | Bot 登录名称 |
| `MC_AUTH` | `offline` | 认证方式：`offline` / `mojang` / `microsoft` |
| `MC_VERSION` | `false` | 游戏版本，`false` 为自动检测 |
| `COMMAND_PREFIX` | `!` | 聊天指令前缀 |
| `RECONNECT_ENABLED` | `true` | 是否启用断线重连 |
| `RECONNECT_MAX_ATTEMPTS` | `10` | 最大重连次数，`-1` 为无限次 |
| `RECONNECT_BASE_DELAY_MS` | `1000` | 首次重连延迟（毫秒） |
| `RECONNECT_MAX_DELAY_MS` | `60000` | 最大重连延迟上限（毫秒） |

## 聊天指令

在 Minecraft 聊天中发送以下指令（默认前缀 `!`）：

| 指令 | 说明 | 示例 |
|---|---|---|
| `!ping` | 返回 Bot 网络延迟 | `Pong! 42ms` |
| `!pos` | 返回 Bot 当前坐标和维度 | `X: 123.5 Y: 64.0 Z: -456.2 (overworld)` |
| `!status` | 返回完整状态摘要 | `HP 20/20 \| Food 18/20 \| Ping 42ms \| overworld` |
| `!come` | Bot 寻路走到你身边 | `Coming to you, Steve!` |
| `!follow <玩家>` | Bot 跟随指定玩家 | `!follow Steve` |
| `!stop` | Bot 停止所有移动 | `Stopped.` |

## 项目结构

```
src/
├── index.ts              # 入口：加载配置、创建 Bot、优雅退出
├── bot.ts                # Bot 工厂：创建实例、插件加载、断线重连
├── config.ts             # 配置加载：读取 .env，校验并导出类型化配置
├── types.ts              # 共享类型：CommandContext、CommandHandler
└── modules/
    ├── chat.ts           # 指令系统：注册表 + 聊天监听 + 指令分发
    ├── health.ts         # 状态指令：!ping、!pos、!status
    └── movement.ts       # 移动指令：!come、!follow、!stop（依赖 pathfinder）
```

## NPM Scripts

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式，`tsx watch` 热重载 |
| `npm run build` | TypeScript 编译到 `dist/` |
| `npm start` | 运行编译后的 JS |
| `npm run clean` | 删除 `dist/` 目录 |

## 断线重连机制

Bot 断线后会自动重连，采用**指数退避**策略：

- 首次重连：等待 1s
- 第二次：2s
- 第三次：4s
- 第四次：8s
- …直到达到 `RECONNECT_MAX_DELAY_MS` 上限（默认 60s）
- 成功生成（spawn）后，重试计数归零

以下情况**不会**触发重连：
- 手动 `Ctrl+C` 退出（发送 `disconnect.quitting`）
- `RECONNECT_ENABLED=false`
- 重试次数达到 `RECONNECT_MAX_ATTEMPTS` 上限

## 扩展指南

添加新指令只需两步，无需修改现有文件：

1. 创建新模块 `src/modules/<name>.ts`
2. 调用 `registerCommand("指令名", handler)` 注册指令
3. 在 `src/bot.ts` 中引入并调用模块的 setup 函数

示例 — 添加 `!jump` 指令：

```typescript
// 新建文件 src/modules/action.ts
import { registerCommand } from "./chat";

export function setupAction(bot: Bot): void {
  registerCommand("jump", (ctx) => {
    ctx.bot.setControlState("jump", true);
    setTimeout(() => ctx.bot.setControlState("jump", false), 200);
    ctx.bot.chat("Jumped!");
  });
}
```

```typescript
// 在 src/bot.ts 的 spawn 回调中添加：
import { setupAction } from "./modules/action";
// ...
setupAction(bot);
```

## 技术栈

- **运行时**: Node.js >= 20
- **语言**: TypeScript
- **核心依赖**: [Mineflayer](https://github.com/PrismarineJS/mineflayer) — Minecraft 协议客户端
- **寻路**: [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) — A* 寻路
- **配置**: [dotenv](https://github.com/motdotla/dotenv)

## 许可证

MIT
