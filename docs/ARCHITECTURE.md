# 架构总览（ARCHITECTURE）

## Monorepo 结构（4 个包）

```
auto-email/
├── packages/
│   ├── shared/         类型 + Zod schema（前后端共享）
│   ├── database/       Drizzle schema + D1 客户端 + libsql 测试 DB
│   ├── server/         Hono 服务 + agent 运行时（AI SDK + 工具注册表）
│   └── cli/            @opentui/react TUI（REPL + 流式渲染 + 主题）
├── .env               机密（gitignored）
└── ~/.bao-auto-mail/  运行时配置、模板、技能（首次运行自动播种）
```

| 包 | 职责 | 依赖 |
|---|---|---|
| `@auto-email/shared` | `RunResponse`/`RunStreamEvent`/`ReplyRecord` 类型 + Zod schema | 无 |
| `@auto-email/database` | `replies` 表 Drizzle schema + `createD1Client`（生产）+ `createTestDb`（测试 libsql）+ `describeSchema` | shared |
| `@auto-email/server` | Hono routes（/api/run 等） + AI 服务（`AiPort` → `createAiService` → DeepSeek）+ 工具注册表 + 技能加载器 | shared, database |
| `@auto-email/cli` | @opentui/react TUI + `server-boot.ts`（spawn 后端）+ 主题系统 + BotMessage/UserMessage 渲染 | shared（server 端通过 HTTP 调用） |

## 数据流

```
CLI (repl.tsx)                      Server (Hono)                     AI (DeepSeek)          D1 (Cloudflare)
───────────────                     ──────────────                    ──────────────          ───────────────
用户输入 /reply + 邮件
  │
  ├─ parseInput() → skill/text
  ├─ runSkillStream() ─── POST ──► /api/run/stream (SSE)
  │                                  │
  │                                  ├─ loadSkills() → 选 skill
  │                                  ├─ routeSkill() ────────────► generateText → 选 skill
  │                                  │
  │                                  ├─ buildToolRegistry() / pickTools()
  │                                  ├─ streamSkill() ────────────► streamText() (fullStream)
  │                                  │   ◄── SSE events ────────     reasoning-delta / text-delta / tool-call / tool-result
  │   ◄── SSE (runSkillStream) ──── stream.onAbort()               │
  │   onEvent → eventsToParts()                                     │
  │   BotMessage 实时渲染                                            │
  │                                                                  │
  │                                  └─ 末尾 generateJson(reply/stats) → result 事件
  │   result → setResult → 渲染最终回复/统计面板
  │
  ├─ 若 reply + shouldConfirm() → ConfirmMenu（用户审核）
  ├─ Ctrl+Y → saveReply() ── POST ──► /api/reply ──────────────────────────────────────► db.insert(replies)
  │                                  ◄── { id }
  └─ clipboard.write() + toast "已复制并保存"
```

### 工具调用链（reply 为例）

```
AI（streamSkill）:
  1. template_list()   → 读取 ~/.bao-auto-mail/templates/*.md → 返回模板列表
  2. template_get('kol-media-support') → 返回模板正文
  3. template_fill(name, {firstName:'Alex'}) → 填 {{firstName}} → 返回完整回复
```

每个工具的 `allowed_tools` 在 SKILL.md 中声明（如 reply 只允许 `[template_list,template_get,template_fill]`）。`pickTools()` 按 skill 的 `allowed_tools` 过滤注册表，作为权限边界。

### SSE 事件类型（`RunStreamEvent`）

| 事件 | 携带 | 说明 |
|---|---|---|
| `skill-selected` | `skill` | 路由选定哪个 skills |
| `reasoning-delta` | `text` | 思考内容增量（DeepSeek thinking） |
| `text-delta` | `text` | 正文增量 |
| `tool-call` | `toolCallId, toolName, args` | 发起工具调用 |
| `tool-result` | `toolCallId, result` | 工具结果 |
| `result` | `result: RunResponse` | 最终结构化结果（reply/stats/text/db-insert/db-query） |
| `error` | `message, fallback?` | 错误（fallback:'manual' 触发手动降级） |
| `done` | `durationMs` | 生成完成 |

## 数据库（D1 → SQLite）

```
replies 表
├── id (TEXT PK)
├── template (TEXT NOT NULL)     ← 回复模板名 / partner 标记
├── emailFrom / emailName / emailContent / replyContent
├── metadata (TEXT, JSON)        ← 灵活统计字段
├── confirmed (INTEGER)          ← AI 提取待确认 → 1
└── createdAt
```

- **运行时**：`drizzle-orm/sqlite-proxy` → D1 `/query` HTTP API
- **迁移**：`drizzle-kit` + `driver:'d1-http'`（`bun run db:push`）
- **测试**：libsql 内存库（`@auto-email/database/test` `createTestDb`）

## 技能（Skill）系统

每个能力是一个 `~/.bao-auto-mail/skills/<name>/SKILL.md`：

```md
---
name: reply
description: Use only for real incoming emails...
allowed_tools: [template_list, template_get, template_fill]   ← 权限边界
output: reply
---
正文（AI 的 system prompt）
```

- 内置 3 个：`reply`（邮件回复）、`stats`（统计查询）、`record`（数据记录）
- 新增 skill：丢一个目录 + SKILL.md 到 `~/.bao-auto-mail/skills/`，零改代码即可用
- 路由：`routeSkill()` 按 `description` 用 AI 选最匹配的技能

## TUI 组件树

```
index.tsx (router)
├── RootLayout
│   ├── ThemeProvider > KeyboardLayerProvider > ToastProvider > DialogProvider > ThemeRoot
│   └── Repl (主屏)
│       └── SessionShell
│           ├── Header (<ascii-font> "Auto Email")
│           ├── scrollbox 消息区
│           │   ├── UserMessage（用户输入卡片）
│           │   ├── BotMessage (parts 分组渲染：reasoning/tool/text)
│           │   ├── StatsView / ReplyMeta / ReviewCard
│           │   └── ProgressView（流式进度）
│           ├── inputSlot（InputBar / ConfirmMenu / ReviewCard / EditBar）
│           └── 底部状态行（Spinner + esc 提示 + 快捷键）
```
