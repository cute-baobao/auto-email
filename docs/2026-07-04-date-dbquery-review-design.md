# 日期查询 + DB 查询 + CLI 审核 — 设计（spec）

> 日期：2026-07-04
> 类型：新增 agent 工具 ×2 + CLI 审核交互层
> 关联：`docs/2026-07-04-ai-db-insert-tool-design.md`、`AGENTS.md`

## 1. 目标

三件事：
- **A** 日期查询工具 `get_current_date`（纯系统，无审核）。
- **B** 通用参数化 `db_query`（SELECT-only，表/列白名单，和 `db_insert` 同级安全）。
- **C** CLI 审核层——AI 选工具 + 填参数后，**弹出确认卡片给用户审核**（确认/取消），审核通过才真正执行。统一拦截 INSERT 和 QUERY；日期工具不用审核。

范围：`shared`（类型+schema）、`server`（工具 + 端点）、`cli`（审核 UI）。已有 `db_insert`（insert-only，不允许 UPDATE/DELETE）不动。

## 2. 决策

| 议题 | 决定 |
|---|---|
| db_query 形态 | 通用参数化：`db_query({ table, columns?, where?, orderBy?, limit? })`，表/列/操作白名单，只 SELECT |
| 审核层 | CLI 层：`runSkillStream` 返回 `db-insert`/`db-query` 类型 result → Repl 弹出审核卡片 → 用户确认→调执行端点；取消→丢弃 |
| 审核覆盖 | 拦截 `db_insert` 和 `db_query`（tool 层面不改，运行时通过 runSkillStream 的 result type 门控） |
| 日期工具 | `get_current_date()` → `{ date, iso, timestamp, dayOfWeek }`（UTC），无审核 |
| LIMIT 默认/上限 | 默认 20，上限 100 |
| 不允许 SQL | UPDATE/DELETE/ALTER 零存在 |

## 3. 设计

### A. `get_current_date`（`packages/server/src/agent/tools/system.ts`，新）
```ts
get_current_date: tool({
  description: 'Return the current date/time in UTC (today).',
  inputSchema: z.object({}),
  execute: async () => {
    const d = new Date();
    return {
      date: d.toISOString().slice(0, 10),
      iso: d.toISOString(),
      timestamp: d.getTime(),
      dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    };
  },
})
```
注册到 `buildToolRegistry`。

### B. `db_query` 工具（`packages/server/src/agent/tools/db.ts` 追加）
```ts
db_query: tool({
  description: 'SELECT rows from an allowed table. READ-ONLY (cannot insert/update/delete). Use the schema to pick table, columns, optional filters, order, and limit.',
  inputSchema: z.object({
    table: z.string(),
    columns: z.array(z.string()).optional(),
    where: z.array(z.object({
      column: z.string(),
      op: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE']),
      value: z.union([z.string(), z.number()]),
    })).optional(),
    orderBy: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  execute: async ({ table, columns, where, orderBy, limit }) =>
    queryRows(db, table, { columns, where, orderBy, limit }),
})
```
`queryRows`（纯函数，可测）实现：
1. `WRITABLE_TABLES` 校验表（只 SELECT——用 writable whitelist 统一管理；后续可改名为 ACCESSIBLE_TABLES）。
2. `columns` 列名校验（和 insertRow 一致）。
3. 用 drizzle query builder: `db.select({...cols}).from(t).where(and(…filters)).orderBy(desc(col)).limit(n)`。
4. `where` 的 op 映射到 drizzle 等价（`=`→eq, `!=`→notEq, `LIKE`→like, `>`→gt 等）。
5. 返回 `{ rows: Record[] }`。

### C. CLI 审核层

**C1. `RunResponse` 扩展**（`packages/shared/src/types.ts`）
```ts
export type RunResponse =
  | { type: 'db-insert'; table: string; values: Record<string,unknown> }
  | { type: 'db-query'; table: string; query: { columns?:string[]; where?:{column:string;op:string;value:unknown}[]; orderBy?:string; limit?:number }; result?: Record<string,unknown>[] }
  | … // 现有 reply/stats/text
```

**C2. `runSkillStream` 返回审核 result**
- AI `streamSkill` 工具调用阶段，tool-call（`db_insert`/`db_query`）的 args 被流入 `streamSkill` 的 `fullStream`。`streamSkill` 在消费 `tool-call`/`tool-result` 时不直接等工具执行结果——而是**跳过实际 execute**（工具 call/result 只入流，副作用推迟到审核后）。
- 改为：`streamSkill` 正常流完 tool-call/tool-result（工具参数和结果都在流中展示），然后**末尾不生成结构化 `result`**（因为 reply/stats 逻辑不适用）。改为：把最后一个 tool-call 的 args 打包成 `{type:'db-insert', table, values}` 或 `{type:'db-query', table, query:{...}}` 放进 `result` 字段。
- 实际上 streamSkill 当前末尾是 `generateJson` 生成 reply/stats——对 record skill（output=text）走 `text` 分支让流式文本显示，末尾 result 用上述结构。

**C3. Repl 审核卡片**
- `result.type === 'db-insert'` / `result.type === 'db-query'` → 不直接执行 → 弹出审核卡片（在输入区，复用 ConfirmMenu 样式）：
  - 展示 `将执行 INSERT|QUERY 操作` + 参数概要。
  - 两个选项：`[确认执行]` / `[取消]`（↑↓ + Enter 或 Ctrl+Y 确认 / Ctrl+N 取消，复用选定 Index + Ctrl 逻辑）。
- **确认** → 调专用执行端点：
  - `POST /api/run/execute` `{ action: 'db-insert', table, values }` 或 `{ action: 'db-query', table, query:{columns?,where?,orderBy?,limit?} }`
  - 路由收到后校验并执行（insertRow / queryRows），返回 `{ rows? }` 或 `{ inserted, id }`。
  - CLI 拿到结果后 toast「执行成功」/渲染返回行。
- **取消** → 丢弃，toast「已取消」。

## 4. 测试 / 验证

- `get_current_date` 单测：返回 shape 含 date/iso/timestamp/dayOfWeek。
- `db_query` / `queryRows` 单测（用 `createTestDb`）：查空表、按 template 筛选、按列 select、limit、op（=`/`!=`）、orderBy、列名校验失败、表名校验失败、op 白名单外拒绝。
- `/api/run/execute` 端到端测试（app.test.ts 新路由）：`db-insert` 成功返回 `inserted/id`，`db-query` 成功返回 `rows`。
- runSkillStream 审核 result 类型：mock streamSkill 返回 `{type:'db-insert',...}`，断言 result shape 校验通过。
- CLI 审核卡片：TUI（tsc+bundle+实跑），键盘 ↑↓/Ctrl 确认取消。

## 5. 改动文件

| 文件 | 改动 |
|---|---|
| `packages/shared/src/types.ts` | + `db-insert`/`db-query` RunResponse 变体 |
| `packages/shared/src/schemas.ts` | + 对应 Zod schema（需同时扩充 `RunStreamEvent` union 含 `result` 的 `RunResponse` 新变体） |
| `packages/server/src/agent/tools/system.ts` | 新增 `get_current_date` |
| `packages/server/src/agent/tools/db.ts` | + `db_query` / `queryRows` |
| `packages/server/src/agent/tools/index.ts` | 注册 system tools |
| `packages/server/src/app.ts` | + `POST /api/run/execute`（审核执行端点，auth insert/query） |
| `packages/server/tests/app.test.ts` | + execute 路由测试 |
| `packages/server/src/services/ai.ts` | `streamSkill` → 审核 result 分支(d-record→db-insert/query) |
| `packages/cli/src/client.ts` | + `executeAction`（调 execute 端点） |
| `packages/cli/src/screens/repl.tsx` | + 审核卡片（确认/取消） |
| `packages/cli/tests/` | `db_query` / `queryRows` 单测 |

## 6. 风险

- AI 不会直接调工具执行——审核在 CLI。但 server 的 `POST /api/run/execute` 端点**必须做和 tool execute 一样的安全校验**（不是暴露裸 SQL），否则 CLI 可以绕开。实现时复用 `insertRow`/`queryRows` + 同一个 `WRITABLE_TABLES` 白名单。
- `streamSkill` 对 record skill 的末尾 result 打包需要区分：skill output='text' 且 tool-call 类型为 db_* → 走审核 result。现有 reply/stats 保持不变。
- 审核卡片复用 ConfirmMenu 样式——确认和取消的两项。↑↓ 移动+Ctrl 快捷键不冲突。
