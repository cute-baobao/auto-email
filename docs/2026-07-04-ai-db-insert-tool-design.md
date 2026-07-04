# AI 数据库写入工具（insert-only）+ schema 注入 — 设计（spec）

> 日期：2026-07-04
> 类型：新增 agent 工具 `db_insert`（只插入）+ schema 摘要注入 + `record` 技能
> 关联：`AGENTS.md`、`docs/2026-07-03-hynote-email-agent-design.md`

## 1. 目标

给 AI 一个**只插入**数据库的能力：把 DB schema 的紧凑摘要注入 AI 提示，AI 用 `db_insert({ table, values })` 往**已有表**里写行（字段随用户需求由 AI 决定）。**不做 update / delete 工具**。首个用途：把一批「已申请 plan、未发邮件通知」的 partner User ID 写进现有 `replies` 表。

范围：`database`（schema 摘要 + 白名单）、`server`（工具 + 提示注入 + 新技能）。不新建表。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 工具形态 | 通用 schema 驱动 `db_insert({ table, values })`，仅 insert |
| 目标表 | 现有 `replies`（白名单当前只含 replies） |
| schema 注入 | 运行时 `describeSchema()` 生成紧凑摘要，当 skill 含 `db_insert` 时拼进 system 提示 |
| 触发 | 新 `record` 技能（output:'text'，allowed_tools:[db_insert]），路由到它 |
| 安全 | 表白名单 + 列白名单校验 + 参数化插入；`id` 缺省自动 uuid；NOT-NULL 无默认列缺失则报错 |
| partner 写法 | `template='partner'`、`email_name=<user_id>`、`metadata={"status":"applied"}`（其余留空） |
| 那批 ID | 全部照原样保存（含 `6ece.0358`/`uisehsj72`） |

## 3. 设计

### 3.1 `packages/database/src/describe.ts`（新）
```ts
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { replies } from './schema';

// AI 可写入的表白名单（目前仅 replies）。
export const WRITABLE_TABLES: Record<string, SQLiteTable> = { replies };

// 生成紧凑 schema 摘要注入 AI 提示（始终与代码同步）。
export function describeSchema(): string {
  const lines: string[] = [];
  for (const [name, table] of Object.entries(WRITABLE_TABLES)) {
    lines.push(`Table ${name}:`);
    for (const [col, def] of Object.entries(getTableColumns(table))) {
      const flags = [
        def.primary ? 'PRIMARY KEY' : '',
        def.notNull ? 'NOT NULL' : 'nullable',
        def.hasDefault ? 'has default' : '',
      ].filter(Boolean).join(', ');
      lines.push(`- ${col} (${def.dataType})${flags ? ` [${flags}]` : ''}`);
    }
  }
  return `Database schema (insert-only):\n${lines.join('\n')}`;
}
```
从 `packages/database/src/index.ts` 导出。（`getTableColumns` 返回的列对象字段名 `primary`/`notNull`/`hasDefault`/`dataType`/`name` 在实现时按装的 drizzle 版本核对，必要时微调。）

### 3.2 `db_insert` 工具（`packages/server/src/agent/tools/db.ts` 追加）
```ts
db_insert: tool({
  description: 'Insert a single row into an allowed database table (INSERT only — cannot update or delete). Use the provided schema to pick the table and columns.',
  inputSchema: z.object({
    table: z.string(),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  execute: async ({ table, values }) => insertRow(db, table, values),
})
```
`insertRow(db, table, values)`（纯函数，可测）：
1. `WRITABLE_TABLES[table]` 不存在 → 抛 `Unknown/!allowed table`。
2. 取 `getTableColumns(t)`；`values` 里未知列 → 抛 `Unknown column`。
3. `id` 类主键（primary 且无默认）缺失 → 自动 `crypto.randomUUID()`。
4. 其余 `notNull && !hasDefault && !primary` 列缺失 → 抛 `Missing required column: <col>`（如 `template`）。
5. `await db.insert(t).values(row)`；返回 `{ inserted: 1, id }`。

（列名映射：drizzle 列的 `.name` 是 DB 列名如 `email_name`，而 `db.insert().values()` 用的是 TS 属性名如 `emailName`。实现时以 **TS 属性名**为准——`values` 的 key 用 TS 属性名，校验/描述也统一用 TS 属性名，避免 snake/camel 混淆；`describeSchema` 里同时可用 TS key 展示。实现时确认。）

### 3.3 提示注入（`packages/server/src/services/ai.ts`）
`streamSkill` / `runSkill` 里构造 system 时：
```ts
const system = skill.allowedTools.includes('db_insert')
  ? `${skill.body}\n\n${describeSchema()}`
  : skill.body;
```
两处（generateText/streamText 与末尾 generateJson 的 system）都用这个 `system`。

### 3.4 `record` 技能（`packages/server/src/assets/skills/record/SKILL.md`，新）
```markdown
---
name: record
description: Use when the user asks to record/save data into the database (e.g. a list of User IDs / partners). NOT for replying to emails or viewing stats.
allowed_tools: [db_insert]
output: text
---
You save data into the database (INSERT only). The database schema is provided below.
For each item the user gives, call db_insert with the right table and values.
Recording an applied-but-not-yet-notified partner: insert into `replies` with template="partner", emailName=<the User ID>, metadata='{"status":"applied"}'. Insert each ID as its own row, exactly as given.
When done, reply in one line with how many rows you inserted.
```
播种到 `~/.bao-auto-mail/skills/record/` 并同步（seeding 只补缺失；实现步骤含 `mkdir + cp`）。

### 3.5 路由 / 菜单
`routeSkill` 列出所有已加载技能，record 加入后即可被选中；无需改路由代码。`/api/skills` 会多出 `record`（`/record` 出现在命令菜单，可接受）。

## 4. 立即任务：记录这 7 个 ID
实现完成后（需真实 `.env`），dogfood：向 `hynote` 发「把这些 partner 记录到数据库：787598579, 261872805, 893014664, 6ece.0358, 258141459, 679652778, uisehsj72」→ 路由到 record → 每个 `db_insert` 一行（template='partner'、emailName=ID、metadata={"status":"applied"}）。全部照原样。

## 5. 测试 / 验证
- `packages/server/tests/db-insert.test.ts`（用 `@hynote/database/test` `createTestDb`）：
  - 合法插入（自动 id + template='partner' + emailName）→ 行入库、返回 id；
  - 未知表 → 抛错；未知列 → 抛错；缺 `template`（NOT NULL 无默认）→ 抛错；
  - 只 insert（无 update/delete 工具存在）。
- `packages/database/tests/describe.test.ts`：`describeSchema()` 含 `replies` 及列名（如 `template`）。
- 路由 / AI 行为不单测；真实终端 dogfood 那 7 个 ID，`/stats` 或直接查库确认写入。

## 6. 改动文件
| 文件 | 改动 |
|---|---|
| `packages/database/src/describe.ts` | 新增 `describeSchema` + `WRITABLE_TABLES` |
| `packages/database/src/index.ts` | 导出 describe |
| `packages/database/tests/describe.test.ts` | 新增单测 |
| `packages/server/src/agent/tools/db.ts` | 追加 `db_insert` + `insertRow` |
| `packages/server/src/agent/tools/index.ts` | 注册 db_insert（已 `...dbTools(db)` 则自动含） |
| `packages/server/tests/db-insert.test.ts` | 新增单测 |
| `packages/server/src/services/ai.ts` | 含 db_insert 的 skill → system 拼 `describeSchema()`（两处） |
| `packages/server/src/assets/skills/record/SKILL.md` | 新增技能（+ 播种/同步到 `~/.bao-auto-mail`） |

## 7. 风险
- partner 写进 `replies` 会让 `/stats` 多出 `template='partner'` 分组（用户已接受，语义混用）。
- drizzle 列元数据字段名（`primary`/`notNull`/`hasDefault`/`dataType`）随版本；实现时核对 `getTableColumns` 返回结构，必要时微调 `insertRow`/`describeSchema`。
- 列名 TS 属性名 vs DB 列名统一用 TS 属性名（drizzle `.values()` 的契约），避免 AI 传 `email_name` 却匹配不上——`describeSchema` 展示 TS key，提示里也用 TS key。
- record 技能是 AI 路由 + 提示引导；边界输入可能误路由——真实 key 实测。
