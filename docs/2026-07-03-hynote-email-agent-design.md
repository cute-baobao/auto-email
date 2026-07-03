# HyNote Email Reply Agent — 设计文档

> 状态：设计已定稿
> 日期：2026-07-03

---

## 1. 项目定位

一个 CLI 工具，帮助 HyNote Affiliate 运营人员半自动回复邮件 + 统计运营数据。形态是**常驻交互会话（REPL）**：运行一次进入会话，用斜杠命令或自然语言表达意图，由 skill 驱动的 agent 完成任务。

### 核心原则

- **不接入邮箱**：手动粘贴邮件内容，agent 生成回复后手动复制发送
- **模板可编辑**：模板作为 `.md` 文件存放在本地配置目录，随时增删改
- **灵活统计**：统计维度可随时扩展，不需要改数据库 schema
- **能力可扩展（skill 驱动）**：每个能力是一个本地 `SKILL.md`，声明它调用哪些内置工具；加新能力只需丢一个 skill 目录，零改代码

---

## 2. 技术栈（参考 baocode）

| 组件 | 选型 |
|---|---|
| Runtime | **Bun** |
| 语言 | TypeScript |
| 结构 | Monorepo（packages: cli, server, database, shared） |
| CLI UI | React + **@opentui/react**（终端渲染，常驻 REPL） |
| Server | **Hono**（本地 Bun 进程运行，非 Cloudflare Worker） |
| Agent 运行时 | **Vercel AI SDK**（`ai` v6）`generateText` + `tools` + `stopWhen: stepCountIs(n)` |
| AI Provider | OpenAI 兼容接口，默认 **DeepSeek**（参考 baocode） |
| 数据库 | **Cloudflare D1** |
| D1 运行时访问 | **`drizzle-orm/sqlite-proxy`** 打 D1 `/query` HTTP 接口 |
| D1 迁移 | **`drizzle-kit`** + `driver: 'd1-http'`（官方文档路径） |
| ORM | **Drizzle ORM** |
| 校验 | **Zod** v4 |
| 测试 | **Vitest** |

---

## 3. 项目结构

```
hynote-email-agent/
├── packages/
│   ├── cli/              # 常驻 REPL 交互 (React + @opentui)
│   │   └── src/
│   │       ├── index.tsx        # 入口，启动 REPL 会话
│   │       ├── repl.tsx         # 输入框 + 斜杠命令 + 输出渲染循环
│   │       ├── slash.ts         # 从 /api/skills 拉 skill 列表生成斜杠命令
│   │       └── renderers/       # 按输出 type 渲染
│   │           ├── reply.tsx    # reply 输出：回复+统计标签+确认/编辑
│   │           ├── stats.tsx    # stats 输出：面板
│   │           └── text.tsx     # 通用文本输出（用户自定义 skill）
│   ├── server/           # Hono 服务（本地 Bun 运行）
│   │   └── src/
│   │       ├── index.ts         # Hono app 入口
│   │       ├── routes/
│   │       │   ├── run.ts       # POST /api/run — 跑 skill（显式或路由）
│   │       │   ├── skills.ts    # GET /api/skills — 列出可用 skill
│   │       │   ├── reply.ts     # POST /api/reply — 确认并写 D1
│   │       │   └── stats.ts     # GET /api/stats — 直接查统计
│   │       ├── agent/
│   │       │   ├── runtime.ts   # skill 执行：generateText + tools + stopWhen
│   │       │   ├── router.ts    # 无斜杠时的意图路由（按 description 选 skill）
│   │       │   ├── skill.ts     # SKILL.md 加载/解析（frontmatter + 正文）
│   │       │   └── tools/       # 内置工具注册表（AI SDK tool()）
│   │       │       ├── template.ts  # template.list / get / fill
│   │       │       └── db.ts         # db.queryStats
│   │       ├── services/
│   │       │   ├── ai.ts        # AI provider 解析（测试中被 mock）
│   │       │   └── template.ts  # 模板加载/填充底层实现
│   │       └── config.ts        # 读取 ~/.bao-auto-mail/config.json + .env
│   ├── database/         # Drizzle schema + D1 客户端
│   │   └── src/
│   │       ├── schema.ts        # 表定义
│   │       └── client.ts        # sqlite-proxy 连接 D1（运行时）
│   └── shared/           # 共享类型 + schema
│       └── src/
│           ├── types.ts         # skill、工具、输出契约、统计类型
│           ├── schemas.ts       # Zod validation schemas
│           └── index.ts
├── packages/database/drizzle.config.ts   # driver: 'd1-http'
├── packages/database/drizzle/            # 生成的迁移 SQL + snapshots
├── .env.example
├── mprocs.yaml           # dev 同时跑 cli + server
├── package.json
├── tsconfig.base.json
└── bun.lock
```

### 用户配置目录

```
~/.bao-auto-mail/
├── templates/
│   ├── user-id-trial.md          # 模板 1: 权限开通类
│   ├── technical-support.md      # 模板 2: 技术问题类
│   ├── affiliate-enablement.md   # 模板 3: 推广赋能类
│   └── kol-media-support.md      # 模板 4: KOL/媒体支持类
├── skills/
│   ├── reply/SKILL.md            # 内置 skill: 回复邮件
│   └── stats/SKILL.md            # 内置 skill: 查统计
└── config.json                   # 非敏感配置（default provider / model / base_url）
```

> 首次运行时，若目录不存在则用出厂内置的 templates + skills 初始化。敏感凭证放项目根 `.env`，见 §9。

模板文件格式示例（`kol-media-support.md`）：变量统一用 **`{{firstName}}`（双花括号）**，签名（Joanna）写死在正文，不做多账号切换。现有 4 个模板文件的 `{firstName}` 需在初始化时统一改为 `{{firstName}}`。模板文件名即模板 ID，用于统计。

### 模板范围说明

原始模板文件（`hynote_affiliate_email_templates.md`）含 5 个模板，本工具只纳入其中 **4 个回复类**模板。第一个 "Onboarding / Follow-up（启动跟进类）" 是**主动发送**的跟进邮件，不属于"收到邮件→回复"的场景，故不纳入。

---

## 4. Skill 系统

### SKILL.md 格式（借鉴 OpenAI Skills 的 manifest 约定）

```markdown
---
name: reply
description: 用户粘贴了一封需要回复的邮件时使用；匹配模板、填充变量、提取统计元数据
allowed_tools: [template.list, template.get, template.fill]
output: reply          # 输出契约类型，CLI 据此渲染
---
你是 HyNote Affiliate 邮件回复助手。读取邮件意图，用 template.list 看候选，
选最合适的模板，用 template.fill 填 {{firstName}} 等变量，并提取统计元数据
（promotion_date、platform、user_id_status）。
```

- frontmatter：`name`（→ 斜杠命令 `/reply`）、`description`（意图路由依据）、`allowed_tools`（**权限边界**，只能调这里声明的工具）、`output`（输出契约类型）
- 正文：该 skill 的 system prompt / 执行指令
- 内置出厂 `reply`、`stats` 两个 skill；用户丢个新目录 + SKILL.md 即可加能力，零改代码

### 内置工具注册表（server 端，AI SDK `tool()`）

| 工具 | 说明 |
|---|---|
| `template.list` | 返回所有模板名 + 用途摘要 |
| `template.get(name)` | 返回指定模板原文 |
| `template.fill(name, vars)` | 用变量填充模板，返回文本 |
| `db.queryStats(dimension?)` | 聚合统计（无 dimension = 3 预置面板；有则按 metadata 键动态分组） |

> **写库不做成 AI 工具**：写 D1 是「用户确认后」的确定性动作，走 `POST /api/reply`，不进 agent 循环。避免 AI 误写。

### Agent 运行时（server）

```typescript
generateText({
  model,                          // 由 config 解析的 provider/model
  system: skill.body,             // SKILL.md 正文
  tools: pickTools(skill.allowed_tools),   // 仅该 skill 声明的工具
  messages,                       // 用户输入
  stopWhen: stepCountIs(n),       // 限制工具调用步数
})
```

执行完返回**结构化输出**，按 skill 的 `output` 类型区分：`{ type: 'reply', ... }`、`{ type: 'stats', ... }`、`{ type: 'text', text }`（用户自定义 skill 默认）。

### 意图路由

- 敲 `/reply`、`/stats`（斜杠命令）→ **显式指定 skill**，跳过路由
- 直接输入文字（无斜杠）→ **一次轻量 AI 路由**：读所有 skill 的 `description`，结构化输出选中的 skill name，再跑该 skill
- `/stats` 无参 → 可**短路直接查库**（不调 AI，直接 `GET /api/stats`）；自然语言统计（"看本月 YouTube 的数据"）才走 stats skill 让 AI 解析维度

---

## 5. 核心工作流

### REPL 会话

```
运行 hynote → 进入常驻会话
      │
      ▼
┌────────────────────────────────────────────┐
│ 用户输入                                     │
│  ├─ /reply <粘贴邮件>  → 显式 reply skill    │
│  ├─ /stats [维度]      → 显式 stats skill    │
│  └─ 纯文字             → AI 路由选 skill      │
└───────────────┬────────────────────────────┘
                ▼
        POST /api/run { input, skill? }
                │
                ▼
     ┌──────────────────────┐   AI 失败
     │  agent 运行时执行 skill │ ──────────→ 报错+重试
     │  (generateText+tools) │            或降级手动选模板
     └──────────┬───────────┘
                ▼
        结构化输出 { type, ... }
                │
                ▼
     ┌──────────────────────┐
     │  CLI 按 type 渲染      │
     │  reply→回复+标签+确认  │
     │  stats→面板           │
     │  text →纯文本         │
     └──────────┬───────────┘
                ▼ (reply 确认后)
        POST /api/reply → 写 D1 + 复制剪贴板
```

### reply 流程细节

1. `/reply` + 粘贴邮件原文（或纯文字被路由到 reply skill）
2. `POST /api/run` 跑 reply skill：agent 用 `template.list` 看候选 → 选模板 → `template.fill` 填变量 → 提取统计元数据 → 返回 `{ type:'reply', template, reply, metadata, email_name, email_from }`
3. CLI 渲染：模板名 + 生成回复 + 提取的统计标签
4. 用户可编辑回复、修正统计标签
5. 确认后：`POST /api/reply` 写 D1，回复复制到剪贴板

**AI 失败降级**：`/api/run` 调 AI 失败（超时 / key 失效 / 限流）时，CLI 展示错误 + 允许重试；同时提供「手动选择模板」入口（列出 4 个模板，选中后直接用原始模板文本，变量留空或手填），不阻断工作流。

### stats 流程细节

- `/stats` 无参 → CLI 直接 `GET /api/stats` 拿 3 预置面板（不走 AI）
- `/stats platform` 或自然语言 → stats skill 调 `db.queryStats(dimension)` 按 metadata 键动态分组
- 渲染三类面板：模板使用量、宣传时间分布、User ID 状态（及任意动态维度）

---

## 6. 数据库设计（D1）

### replies 表

```sql
CREATE TABLE replies (
  id            TEXT PRIMARY KEY,          -- UUID
  template      TEXT NOT NULL,             -- 模板文件名
  email_from    TEXT,                      -- 发件人邮箱
  email_name    TEXT,                      -- 发件人姓名
  email_content TEXT,                      -- 收到的邮件原文（便于回溯/调 prompt）
  reply_content TEXT,                      -- 最终回复内容
  metadata      TEXT DEFAULT '{}',         -- 灵活 JSON 统计字段
  confirmed     INTEGER DEFAULT 0,         -- 0=AI提取待确认, 1=已人工确认
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### metadata JSON 结构（灵活可扩展）

```json
{
  "promotion_date": "2026-08",
  "promotion_quarter": "2026-Q3",
  "platform": "YouTube",
  "user_id_status": "submitted",
  "user_id_value": "abc123"
}
```

- 字段不固定，由 AI 从每次邮件中提取 + 用户手动确认
- 新增统计维度：AI 提取新字段 → 写入 metadata → `db.queryStats` 传 dimension 即可统计，**零迁移**

### 统计查询

3 个预置维度 + 按任意 metadata 键动态分组（`db.queryStats(dimension)` → `json_extract`），dimension 走白名单校验，不开放任意 SQL 输入。

```sql
-- 预置：模板使用量
SELECT template, COUNT(*) FROM replies GROUP BY template;

-- 动态：按任意 metadata 键分组（dimension 白名单校验后拼接）
SELECT json_extract(metadata, '$.' || :dimension) AS value,
       COUNT(*) FROM replies
WHERE json_extract(metadata, '$.' || :dimension) IS NOT NULL
GROUP BY 1;
```

---

## 7. CLI 界面（常驻 REPL）

```
┌──────────────────────────────────────┐
│  HyNote Email Agent                  │
│  输入 /reply 粘贴邮件, /stats 看统计   │
│──────────────────────────────────────│
│  › /reply                            │
│    Hi Joanna, I want to promote      │
│    HyNote on my YouTube channel      │
│    next month. How do I get started? │
│──────────────────────────────────────│
│  [agent 处理中...]                    │
│──────────────────────────────────────│
│  匹配模板: kol-media-support          │
│  生成回复:                            │
│  ┌────────────────────────────────┐  │
│  │ Hi Alex,                       │  │
│  │ Great to hear you're planning  │  │
│  │ content around it! ...         │  │
│  └────────────────────────────────┘  │
│  统计标签:                            │
│  ✓ 宣传平台: YouTube                 │
│  ✓ 计划时间: 2026-08                 │
│  [确认并复制]  [编辑回复]  [取消]     │
│──────────────────────────────────────│
│  › /stats                            │
│  模板使用量:                          │
│  kol-media-support    ████████ 12    │
│  user-id-trial        ██████   9     │
│  ...                                 │
└──────────────────────────────────────┘
```

AI 失败降级：`⚠ AI 调用失败 → [重试] [手动选择模板] [取消]`，手动列出 4 个模板供选。

---

## 8. API 设计

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/run` | POST | 跑 skill（显式或 AI 路由），返回结构化输出 |
| `/api/skills` | GET | 列出可用 skill（name + description + output），供 CLI 斜杠命令菜单 + 路由 |
| `/api/reply` | POST | 确认回复，写入 D1（确定性，不进 agent 循环） |
| `/api/stats` | GET | 直接查统计（`/stats` 短路 + `db.queryStats` 工具共用） |

### POST /api/run

```typescript
// Request
{
  "input": "Hi Joanna, I want to promote HyNote...",
  "skill": "reply"            // 可选；缺省时按 description 路由
}

// Response（reply 输出）
{
  "type": "reply",
  "skill": "reply",
  "template": "kol-media-support",
  "reply": "Hi Alex,\n\nThank you so much...",
  "metadata": { "promotion_date": "2026-08", "platform": "YouTube" },
  "email_name": "Alex",
  "email_from": "alex@example.com"
}

// Response（stats 输出）
{ "type": "stats", "skill": "stats", "panels": [ /* ... */ ] }

// Response（自定义 skill 通用文本输出）
{ "type": "text", "skill": "translate", "text": "..." }

// Error（AI 失败）
{ "error": "AI provider timeout", "fallback": "manual" }
```

### GET /api/skills

```typescript
// Response
[
  { "name": "reply", "description": "...", "output": "reply" },
  { "name": "stats", "description": "...", "output": "stats" }
]
```

### POST /api/reply

```typescript
{
  "template": "kol-media-support",
  "email_name": "Alex",
  "email_from": "alex@example.com",
  "email_content": "Hi Joanna, I want to promote HyNote...",
  "reply_content": "Hi Alex,...",
  "metadata": { "promotion_date": "2026-07", "platform": "YouTube" },
  "confirmed": true
}
```

### GET /api/stats

```
GET /api/stats                     # 三个预置面板
GET /api/stats?dimension=platform  # 任意 metadata 键（白名单校验）
```

---

## 9. 配置与密钥管理

### 敏感凭证 → 项目根目录 `.env`（加入 `.gitignore`）

```
# Cloudflare D1（drizzle-kit d1-http driver + 运行时 sqlite-proxy 都读这些）
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_DATABASE_ID=xxx
CLOUDFLARE_D1_TOKEN=xxx

# AI provider
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
```

### 非敏感配置 → `~/.bao-auto-mail/config.json`

```json
{
  "providers": {
    "default": "deepseek",
    "deepseek": { "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat" },
    "openai":   { "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini" }
  }
}
```

- 通过 Vercel AI SDK 的 OpenAI 兼容接口，支持任意 provider；API key 从 `.env` 读取，config.json 只声明用哪个 provider / model / base_url

---

## 10. Cloudflare D1 + Drizzle 接入（按官方文档）

> 参考：https://orm.drizzle.team/docs/get-started/d1-new

### 依赖

```
bun add drizzle-orm wrangler dotenv
bun add -D drizzle-kit
```

### 迁移 / 建表（本地机器执行，d1-http driver）

`packages/database/drizzle.config.ts`：

```typescript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
```

应用变更：`drizzle-kit push`（快速迭代）或 `drizzle-kit generate` + `drizzle-kit migrate`。**不使用 `wrangler d1 migrations apply`**。

### 运行时访问（本地 Bun server，sqlite-proxy）

server 是本地 Bun 进程（非 Worker，拿不到 `env.DB` binding），运行时用 `drizzle-orm/sqlite-proxy` 封装一个打 D1 REST `/query` 接口的回调：

```typescript
import { drizzle } from 'drizzle-orm/sqlite-proxy';

const db = drizzle(async (sql, params, method) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await res.json();
  const rows = data.result[0].results.map((r) => Object.values(r));
  return { rows: method === 'get' ? rows[0] : rows };
});
```

（具体 rows 映射细节在实现阶段对齐 sqlite-proxy 契约。）

---

## 11. 测试策略（Vitest）

- **框架**：Vitest
- **范围**：所有 API 端点做**端到端**测试（真实 HTTP → Hono → DB）
  - `/api/run`：端到端测其非 AI 逻辑——skill 加载/解析、意图路由分发、工具执行、输出契约、降级路径
  - `/api/skills`：列表正确
  - `/api/reply`、`/api/stats`：完整端到端，含 DB 读写与统计聚合
- **AI/agent 调用不测**：`services/ai.ts` 的实际 LLM 调用在测试中被 **mock**——mock 返回固定的 skill 选择、工具调用序列与结构化输出
- **DB 隔离**：测试注入本地 **libsql/SQLite** 后端的 drizzle 实例（in-memory 或临时文件），**不打远程 D1**；生产 sqlite-proxy 与测试 libsql 共用同一 schema，保证 SQL 兼容

---

## 12. 分发与开发

- **开发**：`mprocs` 同时跑 cli + server（参考 baocode 的 `mprocs.yaml`）
- **本地安装使用**：`bun link` 全局安装 CLI 命令，改代码立即生效
- 不打包独立可执行文件（首版 YAGNI）

---

## 13. 已确认的需求汇总

- [x] 手动粘贴邮件，不接入邮箱
- [x] **常驻 REPL 交互**：斜杠命令 `/reply` `/stats` + 纯文字 AI 意图路由
- [x] **skill 驱动可扩展**：借 SKILL.md 格式 + AI SDK 自建运行时（provider 无关，DeepSeek 照跑）
- [x] skill 声明 `allowed_tools` 作为权限边界；内置工具 template.* / db.queryStats
- [x] 写库不做成 AI 工具，走 /api/reply 确定性写入
- [x] 模板 4 个（排除主动跟进的 onboarding-followup），变量格式 `{{firstName}}`，签名写死
- [x] Bun 运行时；Hono server 本地运行（非 Worker）；`bun link` 安装；mprocs dev
- [x] Cloudflare D1；迁移 drizzle-kit + d1-http（按官方文档）；运行时 sqlite-proxy 打 /query
- [x] 敏感凭证放 `.env`；config.json 只放非敏感配置
- [x] 存邮件原文（email_content 列）
- [x] 统计维度：3 预置 + 按 metadata 键动态分组
- [x] AI 失败：报错+重试，降级为手动选模板
- [x] 回复可编辑后确认
- [x] history 命令首版不做
- [x] 测试：Vitest，API 端到端，AI mock，DB 用本地 sqlite 隔离
- [x] API：/api/run、/api/skills、/api/reply、/api/stats
