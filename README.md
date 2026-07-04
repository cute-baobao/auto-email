# Auto Email (`auto-email`)

一个常驻终端（TUI）的邮件回复助手：粘贴一封 HyNote Affiliate 邮件，AI 自动选模板、填变量、提取统计标签，你确认后一键复制并入库；也能查回复统计。底层是本地 Hono server + Cloudflare D1，AI 走 DeepSeek（流式，带 thinking）。

- **一条命令启动**：`auto-email` 会自动把后端也拉起来（无需单独跑 server）。
- **UI**：ascii 头部、主题可切换、流式渲染（思考/工具/正文）、确认走输入区选项菜单。

---

## 前置要求

- **Bun**（运行时）：https://bun.sh
- **Cloudflare D1** 一个数据库 + 一个有 **D1 Edit** 权限的 **API Token** + **Account ID**、**Database ID**
- **DeepSeek API Key**：https://platform.deepseek.com

---

## 一、安装与配置

```bash
# 1) 装依赖
bun install

# 2) 填密钥
cp .env.example .env
#   编辑 .env，填入：
#   CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_D1_TOKEN
#   DEEPSEEK_API_KEY
#   （AUTO_EMAIL_PORT 默认 45678，一般不用改）

# 3) 建表（推到远程 D1，需要 .env 已填好）
bun run db:generate    # 已生成可跳过
bun run db:push

# 4) 注册全局 hynote 命令
cd packages/cli && bun link      # 之后任意目录可用 `auto-email`
```

> `.env` 已在 `.gitignore` 中，密钥不会进版本库。

---

## 二、用 `auto-email` 命令使用

```bash
hynote
```

启动时它会：

1. 探测 `localhost:45678` 上有没有 server；
2. **没有** → 自动 spawn 一个 server 子进程（日志写到 `~/.bao-auto-mail/server.log`），就绪后进入 TUI；
3. **已有**（比如你先跑了 `bun run dev:server`）→ 直接复用，不重复启动；
4. 你退出 TUI 时，它 spawn 的那个 server 会被一起关掉（复用别人的则不动）。

> 首次运行会把出厂的模板 / skills / `config.json` 播种到 `~/.bao-auto-mail/`。

### REPL 里的操作

| 操作 | 说明 |
|---|---|
| `/reply` 然后粘贴邮件 | AI 选模板、填 `{{firstName}}`、提取统计标签，流式显示思考与工具调用 |
| 纯文字（不带斜杠） | AI 自动判断意图（回复 / 统计） |
| `/stats` | 查统计面板；`/stats platform` 按维度 |
| `/`（打斜杠） | 弹出可用指令菜单（技能列表） |
| **回复待确认时**（输入区变成选项菜单） | `↑/↓` 选择 + `Enter`；或快捷键 `Ctrl+Y` 确认并复制入库 · `Ctrl+E` 编辑 · `Ctrl+N` 取消 |
| `Ctrl+T` | 切换主题（Nightfox / Catppuccin / Dracula / Monokai，自动持久化） |
| `Esc` | 生成中途取消 |
| `Ctrl+C` | 退出 |

---

## 三、配置文件

| 位置 | 内容 |
|---|---|
| `.env`（项目根，gitignore） | 敏感密钥：`CLOUDFLARE_*`、`DEEPSEEK_API_KEY`、可选 `AUTO_EMAIL_PORT`（默认 45678） |
| `~/.bao-auto-mail/config.json` | 非敏感：默认 provider / model / base_url（当前 deepseek-only） |
| `~/.bao-auto-mail/templates/*.md` | 4 个回复模板，变量用 `{{firstName}}`，可随意增删改 |
| `~/.bao-auto-mail/skills/<name>/SKILL.md` | 技能定义（name / description / allowed_tools），可加新技能 |
| `~/.bao-auto-mail/server.log` | `auto-email` 自动启动的 server 日志（排查用） |

---

## 四、自己 bundle / 打包

> **重要**：`auto-email` 的「自动起后端」是靠**相对源码路径** spawn `packages/server/src/index.ts` 实现的，所以最省心的分发方式是保留仓库 + `bun link`（下面方式 A）。把 CLI 单独打成一个搬到别处的产物，会让「自动起后端」失效，需要改成「自己起 server + CLI 连过去」（方式 B/C）。

### 方式 A（推荐）：`bun link` 从源码跑

```bash
cd packages/cli && bun link
hynote          # 从仓库源码运行，自动起后端，路径解析正常
```
适合个人机器长期使用。要求**仓库保留在原处**（server 源码要能被找到）。

### 方式 B：打成可运行的 JS bundle（连一个已跑的 server）

```bash
# 打包 CLI（产物需要用 bun 运行）
bun build packages/cli/src/index.tsx --target bun --outdir dist

# 因为搬了位置，自动起后端的相对路径会失效——所以自己起 server：
bun run dev:server                       # 或 bun packages/server/src/index.ts
# 另开一个终端跑打包后的 CLI（它探测到 45678 有 server 就复用）：
bun dist/index.js
```
也可以让 CLI 指向任意地址的 server：
```bash
AUTO_EMAIL_SERVER=http://localhost:45678 bun dist/index.js
# 或只改端口： AUTO_EMAIL_PORT=45678 bun dist/index.js
```

### 方式 C：单文件可执行（有坑，了解即可）

`bun build --compile` 能产出单个可执行文件，但本项目有两个限制：
- `@opentui` 带**原生 FFI 模块**（`@opentui/core-darwin-arm64` 等），单文件编译对原生依赖支持不稳；
- 「自动起后端」spawn 的是 server **源码**，不在二进制里。

所以单文件二进制不能开箱即用地自启动后端。若真要单文件，做法是：先把 server 单独部署/运行，再用编译出的 CLI 通过 `AUTO_EMAIL_SERVER` / `AUTO_EMAIL_PORT` 连过去（CLI 探测到已在跑就只复用、不 spawn）。日常建议直接用方式 A。

---

## 五、开发

```bash
bun run dev            # mprocs 同时跑 server + cli（开发用）
bun run dev:server     # 只跑后端
bun run dev:cli        # 只跑 CLI
bun run test           # 全部单测（Vitest）
bunx tsc -p packages/<pkg>/tsconfig.json --noEmit   # 类型检查
```

包结构（monorepo）：`shared`（类型/Zod）· `database`（Drizzle + D1）· `server`（Hono + agent 运行时）· `cli`（@opentui/react TUI）。

---

## 六、故障排查

- **进不去 / 一直转**：`cat ~/.bao-auto-mail/server.log` 看后端报错（多半是 `.env` 里 D1 或 DeepSeek key 没填对）。
- **端口被占**：`lsof -ti:45678` 看谁占了；`auto-email` 会复用已在跑的 server。想换端口设 `AUTO_EMAIL_PORT`（server 和 CLI 都读它）。
- **退出后 server 残留**：`lsof -ti:45678` 应为空；若非空说明是你自己起的（`dev:server`），`auto-email` 不会关它。
- **全局 `auto-email` 报找不到 server 入口**：说明 `bun link` 的软链没解析成仓库真实路径导致相对路径失效——用方式 B（自己起 server + CLI 连）临时绕过，并告诉我改成向上查找 workspace 根。
